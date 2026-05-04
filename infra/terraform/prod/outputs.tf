output "d1_database_id" {
  description = "D1 database UUID. Replace the placeholder UUID in apps/api/wrangler.jsonc with this value to unlock `task deploy:api`."
  value       = cloudflare_d1_database.main.id
}

output "d1_database_name" {
  description = "D1 database name (binding-friendly)."
  value       = cloudflare_d1_database.main.name
}

output "web_custom_domain" {
  description = "Hostname mapped to the web Worker."
  value       = cloudflare_workers_custom_domain.web.hostname
}
