---
title: Настройка нового сервера (Ubuntu 22.04)
date: 2026-05-02T16:06:02+00:00
category: Работа/EORA/Сервера
tags: []
status: draft
---
```sh

#!/bin/bash

# --- НАСТРОЙКИ ---

# Адрес вашего Zabbix сервера
ZABBIX_SERVER="zabbix.eora.ru"

# Имя хоста, которое будет отображаться в Zabbix
ZABBIX_HOSTNAME="outline-wiki"

# Новый порт для SSH
NEW_SSH_PORT=2763

# --- КОНЕЦ НАСТРОЕК ---

# Улучшенная обработка ошибок
set -euo pipefail

# Функция обработки ошибок
error_handler() {
    echo "ОШИБКА: Скрипт завершился с ошибкой на строке $1"
    echo "Команда: $2"
    exit 1
}

trap 'error_handler ${LINENO} "$BASH_COMMAND"' ERR

# Проверка, запущен ли скрипт от имени root
if [ "$(id -u)" -ne 0 ]; then
    echo "Пожалуйста, запустите этот скрипт от имени суперпользователя (root или через sudo)"
    exit 1
fi

echo "--- Начало настройки сервера ---"
echo ""

# Подтверждение перед началом
echo "ВНИМАНИЕ!"
echo "Этот скрипт выполнит следующие действия:"
echo "1. Установит и настроит Zabbix Agent"
echo "2. Установит Docker"
echo "3. Установит FZF и Zsh"
echo "4. Изменит порт SSH на $NEW_SSH_PORT"
echo "5. Отключит аутентификацию по паролю SSH"
echo "6. Включит UFW firewall"
echo ""
read -p "У вас настроен SSH-ключ для подключения? (yes/no): " SSH_KEY_CONFIRM

if [ "$SSH_KEY_CONFIRM" != "yes" ]; then
    echo "ОТМЕНА: Сначала настройте SSH-ключ!"
    echo "Инструкция: ssh-copy-id -i ~/.ssh/id_rsa.pub user@server"
    exit 1
fi

read -p "Продолжить установку? (yes/no): " CONTINUE_CONFIRM

if [ "$CONTINUE_CONFIRM" != "yes" ]; then
    echo "Установка отменена пользователем"
    exit 0
fi

# --- 1. Обновление системы ---
echo ""
echo "==> Обновление списка пакетов..."
apt-get update -qq

# --- 2. Установка и настройка Zabbix Agent ---
echo ""
echo "==> Установка Zabbix Agent..."
wget -q https://repo.zabbix.com/zabbix/6.2/ubuntu/pool/main/z/zabbix-release/zabbix-release_6.2-4+ubuntu22.04_all.deb
dpkg -i zabbix-release_6.2-4+ubuntu22.04_all.deb
apt-get update -qq
apt-get install -y zabbix-agent zabbix-sender

echo "==> Настройка Zabbix Agent..."
sed -i -E "s/^Server=.*/Server=$ZABBIX_SERVER/g" /etc/zabbix/zabbix_agentd.conf
sed -i -E "s/^ServerActive=.*/ServerActive=$ZABBIX_SERVER/g" /etc/zabbix/zabbix_agentd.conf
sed -i -E "s/^Hostname=.*/Hostname=$ZABBIX_HOSTNAME/g" /etc/zabbix/zabbix_agentd.conf

echo "==> Перезапуск Zabbix Agent..."
systemctl restart zabbix-agent
systemctl enable zabbix-agent

echo "✓ Zabbix Agent установлен и настроен"

# --- 3. Установка и настройка Docker ---
echo ""
echo "==> Установка Docker..."
apt-get install -y apt-transport-https ca-certificates curl gnupg-agent software-properties-common

# Добавление GPG ключа Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Добавление репозитория Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io

echo "==> Настройка сети Docker..."
tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "default-address-pools": [
        {
            "base": "10.10.0.0/16",
            "size": 24
        }
    ]
}
EOF

echo "==> Перезапуск Docker..."
systemctl restart docker
systemctl enable docker

echo "✓ Docker установлен и настроен"

# --- 4. Установка Zsh и FZF (Fuzzy Finder) ---
echo ""
echo "==> Установка Zsh и FZF..."
apt-get install -y git zsh

# Клонирование FZF
if [ ! -d "/root/.fzf" ]; then
    git clone --depth 1 https://github.com/junegunn/fzf.git /root/.fzf
fi

/root/.fzf/install --key-bindings --completion --update-rc --no-bash --no-fish

echo "==> Настройка FZF для всех пользователей..."
mkdir -p /usr/share/fzf/
cp /root/.fzf/bin/fzf /usr/local/bin/fzf

# Копирование shell интеграции для zsh
if [ -f /root/.fzf/shell/key-bindings.zsh ]; then
    cp /root/.fzf/shell/key-bindings.zsh /usr/share/fzf/key-bindings.zsh
fi

if [ -f /root/.fzf/shell/completion.zsh ]; then
    cp /root/.fzf/shell/completion.zsh /usr/share/fzf/completion.zsh
fi

# Добавление в /etc/skel/.zshrc для новых пользователей
if [ ! -f /etc/skel/.zshrc ] || ! grep -q "FZF - Fuzzy Finder" /etc/skel/.zshrc; then
    {
        echo ''
        echo '# FZF - Fuzzy Finder'
        echo '[ -f /usr/share/fzf/completion.zsh ] && source /usr/share/fzf/completion.zsh'
        echo '[ -f /usr/share/fzf/key-bindings.zsh ] && source /usr/share/fzf/key-bindings.zsh'
    } >> /etc/skel/.zshrc
fi

echo "✓ Zsh и FZF установлены"

# --- 5. Настройка Firewall (UFW) и SSH ---
echo ""
echo "==> Установка UFW..."
apt-get install -y ufw

# Создание бэкапа конфигурации SSH
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)

echo "==> Изменение порта SSH на $NEW_SSH_PORT и отключение аутентификации по паролю..."

# Изменение порта SSH (обработка закомментированных и раскомментированных строк)
if grep -q "^Port " /etc/ssh/sshd_config; then
    sed -i -E "s/^Port .*/Port $NEW_SSH_PORT/g" /etc/ssh/sshd_config
elif grep -q "^#Port " /etc/ssh/sshd_config; then
    sed -i -E "s/^#Port .*/Port $NEW_SSH_PORT/g" /etc/ssh/sshd_config
else
    echo "Port $NEW_SSH_PORT" >> /etc/ssh/sshd_config
fi

# Отключение аутентификации по паролю
if grep -q "^PasswordAuthentication " /etc/ssh/sshd_config; then
    sed -i -E "s/^PasswordAuthentication .*/PasswordAuthentication no/g" /etc/ssh/sshd_config
elif grep -q "^#PasswordAuthentication " /etc/ssh/sshd_config; then
    sed -i -E "s/^#PasswordAuthentication .*/PasswordAuthentication no/g" /etc/ssh/sshd_config
else
    echo "PasswordAuthentication no" >> /etc/ssh/sshd_config
fi

# Включение аутентификации по ключу
if grep -q "^PubkeyAuthentication " /etc/ssh/sshd_config; then
    sed -i -E "s/^PubkeyAuthentication .*/PubkeyAuthentication yes/g" /etc/ssh/sshd_config
elif grep -q "^#PubkeyAuthentication " /etc/ssh/sshd_config; then
    sed -i -E "s/^#PubkeyAuthentication .*/PubkeyAuthentication yes/g" /etc/ssh/sshd_config
else
    echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config
fi

# Проверка конфигурации SSH перед перезапуском
echo "==> Проверка конфигурации SSH..."
if ! sshd -t; then
    echo "ОШИБКА: Неверная конфигурация SSH!"
    echo "Восстанавливаем бэкап..."
    cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config
    exit 1
fi

echo "✓ Конфигурация SSH валидна"

# Настройка правил UFW ПЕРЕД включением firewall
echo ""
echo "==> Добавление правил в UFW..."
ufw --force allow $NEW_SSH_PORT/tcp comment 'SSH'
ufw --force allow 10050/tcp comment 'Zabbix Agent'

# Установка политики по умолчанию
ufw --force default deny incoming
ufw --force default allow outgoing

echo "==> Перезапуск SSH сервиса..."
systemctl restart sshd

# Проверка, что SSH запустился успешно
if ! systemctl is-active --quiet sshd; then
    echo "ОШИБКА: SSH не запустился!"
    echo "Восстанавливаем бэкап..."
    cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config
    systemctl restart sshd
    exit 1
fi

echo "✓ SSH перезапущен на порту $NEW_SSH_PORT"

# Включение UFW
echo ""
echo "==> Включение UFW..."
echo "y" | ufw enable

echo "✓ UFW включен"

# Очистка временных файлов
rm -f zabbix-release_6.2-4+ubuntu22.04_all.deb

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Настройка сервера успешно завершена!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ВАЖНАЯ ИНФОРМАЦИЯ:"
echo ""
echo "1. ✓ Zabbix Agent установлен"
echo "   - Server: $ZABBIX_SERVER"
echo "   - Hostname: $ZABBIX_HOSTNAME"
echo "   - Порт: 10050"
echo ""
echo "2. ✓ Docker установлен и настроен"
echo "   - Подсеть: 10.10.0.0/16"
echo ""
echo "3. ✓ Zsh и FZF установлены"
echo ""
echo "4. ⚠ SSH настроен:"
echo "   - НОВЫЙ ПОРТ: $NEW_SSH_PORT"
echo "   - Аутентификация по паролю: ОТКЛЮЧЕНА"
echo "   - Аутентификация по ключу: ВКЛЮЧЕНА"
echo "   - Бэкап конфига: /etc/ssh/sshd_config.backup.*"
echo ""
echo "5. ✓ UFW Firewall активен:"
echo "   - Разрешен порт $NEW_SSH_PORT/tcp (SSH)"
echo "   - Разрешен порт 10050/tcp (Zabbix)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "СЛЕДУЮЩИЕ ШАГИ:"
echo ""
echo "1. НЕ ЗАКРЫВАЙТЕ это SSH соединение!"
echo ""
echo "2. Откройте новый терминал и проверьте подключение:"
echo "   ssh -p $NEW_SSH_PORT $(whoami)@$(hostname -I | awk '{print $1}')"
echo ""
echo "3. Если подключение работает - можно закрыть старую сессию"
echo ""
echo "4. Проверьте статус UFW:"
echo "   sudo ufw status verbose"
echo ""
echo "5. Проверьте статус Zabbix Agent:"
echo "   sudo systemctl status zabbix-agent"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

```
