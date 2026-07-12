# Backup sidecar. Based on the SAME Postgres version as the DB so pg_dump/pg_restore
# are guaranteed compatible. Adds gnupg (encryption), rclone (off-site), curl (monitoring).
FROM postgres:16-alpine

RUN apk add --no-cache bash gnupg rclone curl tzdata coreutils findutils

COPY db-backup.sh db-restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/db-backup.sh /usr/local/bin/db-restore.sh /usr/local/bin/entrypoint.sh

# Dumps land here (bind-mounted from the host in docker-compose).
VOLUME ["/backups"]

ENTRYPOINT ["entrypoint.sh"]
CMD ["schedule"]
