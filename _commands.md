# project dependencies (internal only)
pnpm list --recursive --only-projects --json

# reset git to 0.0.0
git tag -l | xargs -n 1 git push --delete origin
git tag | xargs git tag -d
git reset --soft id-of-first-revision-of-master
git commit --amend -m "single commit for master"
git push --force