#!/bin/sh
set -e

echo "== migrate: Starting Prisma migration process"
echo "== migrate: Using DB_* params for Prisma v7"
echo "== migrate: DB_HOST=${DB_HOST}"

cd /app

# Run Prisma migrations
echo "== migrate: Running prisma migrate deploy..."
prisma migrate deploy

# Load initial data from casn.sql
if [ -f "/app/casn.sql" ]; then
    echo "== migrate: Loading initial data from casn.sql..."
    
    # Create temporary password file to avoid password exposure
    echo "$DB_PASSWORD" > /tmp/mysql_password
    chmod 600 /tmp/mysql_password
    
    # Load data using MySQL with password from file
    mysql -h mysql -u "$DB_USER" --password-file=/tmp/mysql_password "$DB_NAME" < /app/casn.sql
    
    # Clean up
    rm -f /tmp/mysql_password
    echo "== migrate: Data loaded successfully"
else
    echo "== migrate: casn.sql not found, skipping data load"
fi

echo "== migrate: Migration completed successfully"