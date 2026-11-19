#!/bin/sh
# One-shot bootstrap for the local S3-compatible storage (STORAGE_DRIVER=local).
# Idempotent: safe to run on every `docker compose up`.
#   - private bucket (NIC scans, exam PDFs, slips, materials): no anonymous access
#   - public bucket (avatars, banners): anonymous read
#   - CORS so the browser can PUT presigned uploads from the local app origin
set -eu

ENDPOINT="${S3_ENDPOINT:-http://storage:9000}"
PRIVATE_BUCKET="${R2_BUCKET_NAME:-lms-private}"
PUBLIC_BUCKET="${R2_PUBLIC_BUCKET_NAME:-lms-public}"
aws_s3api() { aws --endpoint-url "$ENDPOINT" s3api "$@"; }

echo "storage-init: waiting for $ENDPOINT"
i=0
until aws_s3api list-buckets >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -ge 60 ] && { echo "storage-init: storage did not become ready" >&2; exit 1; }
  sleep 2
done

for bucket in "$PRIVATE_BUCKET" "$PUBLIC_BUCKET"; do
  if ! aws_s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    aws_s3api create-bucket --bucket "$bucket" >/dev/null
    echo "storage-init: created $bucket"
  fi
done

CORS='{"CORSRules":[{"AllowedOrigins":["http://localhost","http://localhost:3000","http://127.0.0.1","http://127.0.0.1:3000"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]}'
aws_s3api put-bucket-cors --bucket "$PRIVATE_BUCKET" --cors-configuration "$CORS"
aws_s3api put-bucket-cors --bucket "$PUBLIC_BUCKET" --cors-configuration "$CORS"

POLICY="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::${PUBLIC_BUCKET}/*\"]}]}"
aws_s3api put-bucket-policy --bucket "$PUBLIC_BUCKET" --policy "$POLICY"

echo "storage-init: ready ($PRIVATE_BUCKET private, $PUBLIC_BUCKET public)"
