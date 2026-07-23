-- 历史版本会在报告完成时自动创建公开链接。
-- 隐私策略改为显式开启后，先统一关闭历史链接；报告所有者可在报告页重新开启分享。
UPDATE "Report"
SET "shareSlug" = NULL
WHERE "shareSlug" IS NOT NULL;
