`backup.sh`

```shell

#!/bin/bash

# Конфигурация
export AWS_ENDPOINT_URL_S3=https://storage.yandexcloud.net
BACKUP_DIR="/tmp/outline-backup-$(date +%Y%m%d-%H%M%S)"
S3_BUCKET="eora-outline-wiki-1"
COMPOSE_DIR="/home/a.blinov/outline-wiki"
RETENTION_DAYS=90

# Создаем временную директорию
mkdir -p "$BACKUP_DIR"

echo "=== Starting Outline backup at $(date) ==="

# 1. Бэкап PostgreSQL базы данных
echo "Backing up PostgreSQL database..."
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U outline_user -d outline -F c -b -v \
  > "$BACKUP_DIR/outline-db.dump" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ Database backup completed"
    gzip "$BACKUP_DIR/outline-db.dump"
else
    echo "✗ Database backup failed"
    rm -rf "$BACKUP_DIR"
    exit 1
fi

# 2. Бэкап файлов из storage-data volume
echo "Backing up storage files..."
docker run --rm \
  -v outline-wiki_storage-data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/storage-data.tar.gz -C /data . 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ Storage files backup completed"
else
    echo "✗ Storage files backup failed"
    rm -rf "$BACKUP_DIR"
    exit 1
fi

# 3. Бэкап конфигурации
echo "Backing up configuration..."
cp "$COMPOSE_DIR/docker.env" "$BACKUP_DIR/docker.env"
cp "$COMPOSE_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose.yml"
cp "$COMPOSE_DIR/redis.conf" "$BACKUP_DIR/redis.conf" 2>/dev/null || true

# 4. Создаем финальный архив
echo "Creating final archive..."
ARCHIVE_NAME="outline-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar czf "/tmp/$ARCHIVE_NAME" -C "$(dirname $BACKUP_DIR)" "$(basename $BACKUP_DIR)"

# 5. Загружаем в Yandex Object Storage
echo "Uploading to Yandex Object Storage..."
aws s3 cp "/tmp/$ARCHIVE_NAME" "s3://$S3_BUCKET/backups/$ARCHIVE_NAME"

if [ $? -eq 0 ]; then
    echo "✓ Backup uploaded to S3: $ARCHIVE_NAME"
    BACKUP_SIZE=$(du -h "/tmp/$ARCHIVE_NAME" | cut -f1)
    echo "  Size: $BACKUP_SIZE"
else
    echo "✗ Upload to S3 failed"
    rm -rf "$BACKUP_DIR"
    rm -f "/tmp/$ARCHIVE_NAME"
    exit 1
fi

# 6. Очистка старых бэкапов (старше RETENTION_DAYS дней)
echo "Cleaning up old backups (older than $RETENTION_DAYS days)..."
OLDER_THAN=$(date -d "-$RETENTION_DAYS days" +%s)
aws s3 ls "s3://$S3_BUCKET/backups/" | while read -r line; do
    BACKUP_DATE=$(echo "$line" | awk '{print $1" "$2}')
    BACKUP_TIMESTAMP=$(date -d "$BACKUP_DATE" +%s 2>/dev/null)
    BACKUP_FILE=$(echo "$line" | awk '{print $4}')

    if [[ -n "$BACKUP_TIMESTAMP" ]] && [[ $BACKUP_TIMESTAMP -lt $OLDER_THAN ]] && [[ -n "$BACKUP_FILE" ]]; then
        echo "  Deleting old backup: $BACKUP_FILE"
        aws s3 rm "s3://$S3_BUCKET/backups/$BACKUP_FILE"
    fi
done

# 7. Очистка локальных временных файлов
echo "Cleaning up local temporary files..."
rm -rf "$BACKUP_DIR"
rm -f "/tmp/$ARCHIVE_NAME"

echo "=== Backup completed successfully at $(date) ==="
echo ""
echo "Backup location: s3://$S3_BUCKET/backups/$ARCHIVE_NAME"
```

`restore.sh`

```shell

#!/bin/bash

# Конфигурация
export AWS_ENDPOINT_URL_S3=https://storage.yandexcloud.net
S3_BUCKET="eora-outline-wiki-1"
COMPOSE_DIR="/home/a.blinov/outline-wiki"

# Проверяем параметр
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-filename>"
    echo ""
    echo "Available backups:"
    aws s3 ls "s3://$S3_BUCKET/backups/" | grep "outline-backup-"
    exit 1
fi

BACKUP_FILE="$1"
RESTORE_DIR="/tmp/outline-restore-$(date +%Y%m%d-%H%M%S)"

echo "=== Starting Outline restore from $BACKUP_FILE ==="
echo ""
read -p "⚠️  This will REPLACE current data. Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# 1. Скачиваем бэкап из S3
echo ""
echo "Downloading backup from S3..."
aws s3 cp "s3://$S3_BUCKET/backups/$BACKUP_FILE" "/tmp/$BACKUP_FILE"

if [ $? -ne 0 ]; then
    echo "✗ Failed to download backup"
    exit 1
fi

# 2. Распаковываем архив
echo "Extracting backup..."
mkdir -p "$RESTORE_DIR"
tar xzf "/tmp/$BACKUP_FILE" -C "$RESTORE_DIR" --strip-components=1

# 3. Останавливаем Outline
echo "Stopping Outline..."
cd "$COMPOSE_DIR"
docker compose down

# 4. Запускаем только PostgreSQL
echo "Starting PostgreSQL..."
docker compose up -d postgres
echo "Waiting for PostgreSQL to be ready..."
sleep 15

# 5. Восстанавливаем базу данных
echo "Restoring PostgreSQL database..."
gunzip "$RESTORE_DIR/outline-db.dump.gz"
docker compose exec -T postgres dropdb -U outline_user outline --if-exists
docker compose exec -T postgres createdb -U outline_user outline
docker compose exec -T postgres \
  pg_restore -U outline_user -d outline --no-owner --no-acl \
  < "$RESTORE_DIR/outline-db.dump"

if [ $? -eq 0 ]; then
    echo "✓ Database restored successfully"
else
    echo "✗ Database restore failed"
    exit 1
fi

# 6. Восстанавливаем файлы
echo "Restoring storage files..."
docker run --rm \
  -v outline-wiki_storage-data:/data \
  -v "$RESTORE_DIR":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/storage-data.tar.gz -C /data"

if [ $? -eq 0 ]; then
    echo "✓ Storage files restored successfully"
else
    echo "✗ Storage files restore failed"
fi

# 7. Восстанавливаем конфигурацию (с бэкапом текущей)
echo "Backing up current configuration..."
cp "$COMPOSE_DIR/docker.env" "$COMPOSE_DIR/docker.env.backup-$(date +%Y%m%d-%H%M%S)"
cp "$COMPOSE_DIR/docker-compose.yml" "$COMPOSE_DIR/docker-compose.yml.backup-$(date +%Y%m%d-%H%M%S)"

echo "Configuration files backed up with timestamp"
echo ""
echo "Restored configuration saved as:"
echo "  - $RESTORE_DIR/docker.env"
echo "  - $RESTORE_DIR/docker-compose.yml"
echo ""
read -p "Restore configuration files? (yes/no): " RESTORE_CONFIG

if [ "$RESTORE_CONFIG" = "yes" ]; then
    cp "$RESTORE_DIR/docker.env" "$COMPOSE_DIR/docker.env"
    cp "$RESTORE_DIR/docker-compose.yml" "$COMPOSE_DIR/docker-compose.yml"
    [ -f "$RESTORE_DIR/redis.conf" ] && cp "$RESTORE_DIR/redis.conf" "$COMPOSE_DIR/redis.conf"
    echo "✓ Configuration restored"
fi

# 8. Запускаем Outline
echo ""
echo "Starting Outline..."
docker compose up -d

# 9. Очистка
rm -rf "$RESTORE_DIR"
rm -f "/tmp/$BACKUP_FILE"

echo ""
echo "=== Restore completed successfully at $(date) ==="
echo ""
echo "Please check: https://outline.eora.ru"
```

`check-backup.sh`

```shell

#!/bin/bash

export AWS_ENDPOINT_URL_S3=https://storage.yandexcloud.net
S3_BUCKET="eora-outline-wiki-1"

echo "=== Outline Backup Status ==="
echo ""
echo "Latest backups:"
aws s3 ls "s3://$S3_BUCKET/backups/" | grep "outline-backup-" | sort -r | head -n 10

echo ""
echo "=== Backup Statistics ==="
TOTAL_BACKUPS=$(aws s3 ls "s3://$S3_BUCKET/backups/" | grep "outline-backup-" | wc -l)
echo "Total backups: $TOTAL_BACKUPS"

echo ""
echo "Latest backup details:"
LATEST=$(aws s3 ls "s3://$S3_BUCKET/backups/" | grep "outline-backup-" | sort -r | head -n 1)
if [ -n "$LATEST" ]; then
    LATEST_FILE=$(echo "$LATEST" | awk '{print $4}')
    LATEST_DATE=$(echo "$LATEST" | awk '{print $1" "$2}')
    LATEST_SIZE=$(echo "$LATEST" | awk '{print $3}')

    echo "  File: $LATEST_FILE"
    echo "  Date: $LATEST_DATE"
    echo "  Size: $(numfmt --to=iec-i --suffix=B $LATEST_SIZE 2>/dev/null || echo $LATEST_SIZE)"

    # Проверка возраста последнего бэкапа
    LATEST_TIMESTAMP=$(date -d "$LATEST_DATE" +%s)
    NOW_TIMESTAMP=$(date +%s)
    AGE_HOURS=$(( ($NOW_TIMESTAMP - $LATEST_TIMESTAMP) / 3600 ))

    echo "  Age: $AGE_HOURS hours"

    if [ $AGE_HOURS -gt 168 ]; then
        echo "  ⚠️  WARNING: Backup is older than 7 days!"
    else
        echo "  ✓ Backup is recent"
    fi
else
    echo "  ✗ No backups found!"
fi

echo ""
echo "=== Storage Usage ==="
aws s3 ls "s3://$S3_BUCKET/backups/" --recursive --summarize | tail -n 2
```

## Использование

**Создать бэкап:**

```bash
/home/a.blinov/outline-wiki/backup/backup.sh
```

**Проверить статус:**

```bash
/home/a.blinov/outline-wiki/backup/check-backup.sh
```

**Восстановить:**

```bash
/home/a.blinov/outline-wiki/backup/restore.sh outline-backup-20251021-030000.tar.gz
```

**Просмотр логов:**

```python
bash
tail -f /home/a.blinov/outline-wiki/backup/backup.log
```
