#!/bin/bash

# Setup Let's Encrypt SSL Certificate
# This script helps set up SSL certificates using Let's Encrypt

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${1:-""}
EMAIL=${2:-""}
CERT_PATH="/etc/letsencrypt/live"
APP_CERT_PATH="./certs"

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Check if running as root (required for certbot)
if [[ $EUID -ne 0 ]]; then
   print_message $RED "This script must be run as root (use sudo)"
   exit 1
fi

# Check for required parameters
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    print_message $RED "Usage: sudo ./setup-letsencrypt.sh <domain> <email>"
    print_message $YELLOW "Example: sudo ./setup-letsencrypt.sh example.com admin@example.com"
    exit 1
fi

print_message $GREEN "Setting up Let's Encrypt SSL certificate for $DOMAIN"

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    print_message $YELLOW "Installing certbot..."
    
    # Detect OS and install accordingly
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        apt-get update
        apt-get install -y certbot
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS/Fedora
        yum install -y certbot
    elif [ -f /etc/alpine-release ]; then
        # Alpine Linux
        apk add --no-cache certbot
    else
        print_message $RED "Unsupported OS. Please install certbot manually."
        exit 1
    fi
fi

# Stop any running services on port 80 (required for standalone mode)
print_message $YELLOW "Stopping services on port 80..."
systemctl stop nginx 2>/dev/null || true
systemctl stop apache2 2>/dev/null || true
systemctl stop httpd 2>/dev/null || true

# Obtain certificate
print_message $GREEN "Obtaining certificate from Let's Encrypt..."
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN" \
    --keep-until-expiring \
    --expand

# Check if certificate was obtained successfully
if [ ! -f "$CERT_PATH/$DOMAIN/fullchain.pem" ]; then
    print_message $RED "Failed to obtain certificate"
    exit 1
fi

print_message $GREEN "Certificate obtained successfully!"

# Create certs directory if it doesn't exist
mkdir -p "$APP_CERT_PATH"

# Create symbolic links to certificates
print_message $YELLOW "Creating symbolic links to certificates..."
ln -sf "$CERT_PATH/$DOMAIN/fullchain.pem" "$APP_CERT_PATH/server.crt"
ln -sf "$CERT_PATH/$DOMAIN/privkey.pem" "$APP_CERT_PATH/server.key"
ln -sf "$CERT_PATH/$DOMAIN/chain.pem" "$APP_CERT_PATH/ca.crt"

# Set appropriate permissions
chmod 755 "$APP_CERT_PATH"
chmod 644 "$APP_CERT_PATH/server.crt"
chmod 644 "$APP_CERT_PATH/server.key"
chmod 644 "$APP_CERT_PATH/ca.crt"

# Set up automatic renewal
print_message $YELLOW "Setting up automatic renewal..."

# Create renewal hook script
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-app.sh << 'EOF'
#!/bin/bash
# Reload application after certificate renewal

# Copy new certificates
cp /etc/letsencrypt/live/DOMAIN/fullchain.pem /path/to/app/certs/server.crt
cp /etc/letsencrypt/live/DOMAIN/privkey.pem /path/to/app/certs/server.key
cp /etc/letsencrypt/live/DOMAIN/chain.pem /path/to/app/certs/ca.crt

# Reload or restart your application
# systemctl reload your-app-service
# or
# pm2 reload your-app

echo "Certificates renewed and application reloaded"
EOF

# Replace DOMAIN placeholder
sed -i "s/DOMAIN/$DOMAIN/g" /etc/letsencrypt/renewal-hooks/deploy/reload-app.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-app.sh

# Add cron job for automatic renewal
if ! crontab -l | grep -q certbot; then
    (crontab -l 2>/dev/null; echo "0 0,12 * * * /usr/bin/certbot renew --quiet") | crontab -
    print_message $GREEN "Automatic renewal cron job added"
fi

# Test renewal
print_message $YELLOW "Testing certificate renewal..."
certbot renew --dry-run

# Print environment variables to add
print_message $GREEN "\n✅ SSL Certificate setup complete!"
print_message $YELLOW "\nAdd these environment variables to your .env file:"
echo "HTTPS_ENABLED=true"
echo "SSL_CERT_PATH=$APP_CERT_PATH/server.crt"
echo "SSL_KEY_PATH=$APP_CERT_PATH/server.key"
echo "SSL_CA_PATH=$APP_CERT_PATH/ca.crt"
echo "HTTPS_PORT=3443"
echo "REDIRECT_HTTP=true"

print_message $GREEN "\nCertificate details:"
openssl x509 -in "$CERT_PATH/$DOMAIN/fullchain.pem" -noout -dates

print_message $YELLOW "\n⚠️  Remember to:"
print_message $YELLOW "1. Update your firewall to allow HTTPS traffic (port 443)"
print_message $YELLOW "2. Configure your application to use the certificates"
print_message $YELLOW "3. Test your SSL configuration at: https://www.ssllabs.com/ssltest/"