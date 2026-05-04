# Bind the root domain to the web Worker.
# Cloudflare auto-creates the necessary A/AAAA records for the custom domain.
#
# Path-based routing: `example.com/api/*` is routed to the api Worker via
# `routes` declared in apps/api/wrangler.jsonc — those routes have higher
# priority than this Custom Domain, so /api/* never hits the web Worker.
#
# The Worker scripts themselves (web, api) are deployed by `wrangler deploy`,
# not by terraform, to avoid drift between code and infrastructure.
resource "cloudflare_workers_custom_domain" "web" {
  account_id  = var.cloudflare_account_id
  hostname    = var.domain
  service     = "tech-event-scheduler-web"
  zone_id     = var.zone_id
  environment = var.environment
}
