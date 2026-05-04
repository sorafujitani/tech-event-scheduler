# D1 database for the api Worker.
# After apply, `terraform output d1_database_id` returns the UUID — replace the
# placeholder UUID in apps/api/wrangler.jsonc with that value to unlock deploy.
resource "cloudflare_d1_database" "main" {
  account_id = var.cloudflare_account_id
  name       = "tech-event-scheduler"
}
