#!/bin/bash

# Detect platform and deploy
if command -v railway &> /dev/null; then
    echo "Deploying with Railway..."
    railway up
elif command -v vercel &> /dev/null; then
    echo "Deploying with Vercel..."
    vercel
elif command -v fly &> /dev/null; then
    echo "Deploying with Fly.io..."
    fly deploy
elif command -v heroku &> /dev/null; then
    echo "Deploying with Heroku..."
    heroku create clawdbot-health-dashboard
    git push heroku master
else
    echo "No deployment platform detected. Please install Railway, Vercel, Fly.io, or Heroku."
    exit 1
fi