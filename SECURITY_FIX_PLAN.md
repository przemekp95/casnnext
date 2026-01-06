# Plan naprawy security issues

## Krok 1: Sprawdź security alerts
Idź do: https://github.com/przemekp95/casnnext/security/dependabot/18

## Krok 2: Zaktualizuj vulnerable dependencies
Sprawdź package.json i zaktualizuj:
- outdated packages
- packages z known vulnerabilities

## Krok 3: Test i commit
```bash
npm audit
npm update
git add .
git commit -m "fix: security updates"
git push origin main
```

## Krok 4: Spróbuj merge ponownie
Po naprawie security issues, spróbuj merge feature branch do main.