---
title: Деплой Outline Wiki
date: 2026-05-02T16:06:02+00:00
category: Работа/EORA/Сервисы
tags: []
status: draft
---
`docker.env`

```shell
NODE_ENV=production

URL=https://outline.eora.ru
PORT=3000

COLLABORATION_URL=
CDN_URL=

WEB_CONCURRENCY=2

SECRET_KEY=6c446fb775de4a6126ab9fb96ab6c1162f5040ddbf978f762b847ebd82f1a231
UTILS_SECRET=5107b52ee8b8a913d1d9b6a69352b9c847e3509c98408df2e77e7b9749aba1c4

DEFAULT_LANGUAGE=en_US

DATABASE_URL=postgres://outline_user:B6oTkO89@postgres:5432/outline
DATABASE_CONNECTION_POOL_MIN=
DATABASE_CONNECTION_POOL_MAX=
PGSSLMODE=disable

REDIS_URL=redis://redis:6379

FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=/var/lib/outline/data
FILE_STORAGE_UPLOAD_MAX_SIZE=262144000
FILE_STORAGE_IMPORT_MAX_SIZE=524288000
FILE_STORAGE_WORKSPACE_IMPORT_MAX_SIZE=1048576000

SSL_KEY=
SSL_CERT=
FORCE_HTTPS=true

GOOGLE_CLIENT_ID=1008737042593-k4jjhkjlo98jsfkflr5bhh48tqp31ig8.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USERNAME=skills@eora.ru
SMTP_PASSWORD=xovitexbjdztmlee
SMTP_FROM_EMAIL=skills@eora.ru

RATE_LIMITER_ENABLED=false
RATE_LIMITER_REQUESTS=1000
RATE_LIMITER_DURATION_WINDOW=60

# The GitHub integration allows previewing issue and pull request links

# DOCS: https://docs.getoutline.com/s/hosting/doc/github-GchT3NNxI9
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=
GITHUB_APP_NAME=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=

# For Dropbox integration, follow these instructions to get the key https://www.dropbox.com/developers/embedder#setup

# and do not forget to whitelist your domain name in the app settings
DROPBOX_APP_KEY=

SENTRY_DSN=https://0dbe5c8868b38c100fb8fa419bfd5730@sentry2.eora.ru/32

# Enable importing pages from a Notion workspace

# DOCS: https://docs.getoutline.com/s/hosting/doc/notion-2v6g7WY3l3
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# The Iframely integration allows previews of third-party content within Outline.

# For example, hovering over an external link will show a preview.

# DOCS: https://docs.getoutline.com/s/hosting/doc/iframely-HwLF1EZ9mo
IFRAMELY_URL=
IFRAMELY_API_KEY=

ENABLE_UPDATES=false
DEBUG=cache,presenters,events,emails,mailer,utils,multiplayer,server,services
LOG_LEVEL=debug
```

`docker-compose.yml`

```docker
services:
  outline:
    image: outlinewiki/outline:latest
    env_file: ./docker.env
    restart: always
    expose:
      - "3000"
    volumes:
      - storage-data:/var/lib/outline/data
    depends_on:
      - postgres
      - redis

  redis:
    image: redis:7
    env_file: ./docker.env
    restart: always
    expose:
      - "6379"
    volumes:
      - ./redis.conf:/redis.conf
    command: ["redis-server", "/redis.conf"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 30s
      retries: 3

  postgres:
    image: postgres:14
    env_file: ./docker.env
    restart: always
    expose:
      - "5432"
    volumes:
      - database-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-d", "outline", "-U", "outline_user"]
      interval: 30s
      timeout: 20s
      retries: 3
    environment:
      PGDATA: '/var/lib/postgresql/data'
      POSTGRES_USER: 'outline_user'
      POSTGRES_PASSWORD: 'B6oTkO89'
      POSTGRES_DB: 'outline'

  https-portal:
    image: steveltn/https-portal:1
    env_file: ./docker.env
    ports:
      - '80:80'
      - '443:443'
    links:
      - outline
    restart: always
    volumes:
      - https-portal-data:/var/lib/https-portal
    healthcheck:
      test: ["CMD", "service", "nginx", "status"]
      interval: 30s
      timeout: 20s
      retries: 3
    environment:
      DOMAINS: 'outline.eora.ru -> http://outline:3000'
      STAGE: 'production'
      WEBSOCKET: 'true'
      CLIENT_MAX_BODY_SIZE: '200M'

volumes:
  https-portal-data:
  storage-data:
  database-data:
```

`Yandex Object Storage`

```python

# Идентификатор ключа
YCAJEmnZKFMUcdBh6cXljoTrn

# Ваш секретный ключ
YCNGwgaOahcrLAPX69V8bq2M13dLVZyM9e6QnBuI

# Бакет
eora-outline-wiki-1
```

`Установка актуального AWS CLI`

```shell
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install`
```

`~/.aws/config`

```shell
[default]
region = ru-central1
format = json
endpoint_url = https://storage.yandexcloud.net
```

`~/.aws/credentials`

```shell
[default]
aws_access_key_id = YCAJEmnZKFMUcdBh6cXljoTrn
aws_secret_access_key = YCNGwgaOahcrLAPX69V8bq2M13dLVZyM9e6QnBuI
```

`crontab`

```shell

# Edit this file to introduce tasks to be run by cron.

#

# Each task to run has to be defined through a single line

# indicating with different fields when the task will be run

# and what command to run for the task

#

# To define the time you can provide concrete values for

# minute (m), hour (h), day of month (dom), month (mon),

# and day of week (dow) or use '*' in these fields (for 'any').

#

# Notice that tasks will be started based on the cron's system

# daemon's notion of time and timezones.

#

# Output of the crontab jobs (including errors) is sent through

# email to the user the crontab file belongs to (unless redirected).

#

# For example, you can run a backup of all your user accounts

# at 5 a.m every week with:

# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/

#

# For more information see the manual pages of crontab(5) and cron(8)

#

# m h  dom mon dow   command

0 3 * * 0 /home/a.blinov/outline-wiki/backup/backup.sh >> /home/a.blinov/outline-wiki/backup/backup.log 2>&1
0 9 * * * /home/a.blinov/outline-wiki/backup/check-backup.sh >> /home/a.blinov/outline-wiki/backup/check.log 2>&1
```
