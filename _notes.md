# Note on pnpm.

If not using workspace protocol ("workspace:^1.5.0") and having fixed version numbers
for internal packages, other packages that import them have to import the EXACT version,
otherwise when you run pnpm install it will try to resolve that first, and if it does
NOT match it will try to install it from the npm registry and throw a very confusing
error.

nx beta 2 > 6

# Verdaccio user data

/home/user/.config/verdaccio
