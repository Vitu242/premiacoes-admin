# ============================================
# Envia o projeto para o servidor (Windows)
# Exclui node_modules, .next, .git para envio rapido
# Uso: .\scripts\enviar-para-servidor.ps1 -Ip SEU_IP
# Ex.: .\scripts\enviar-para-servidor.ps1 -Ip 167.71.168.183
# ============================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Ip,
    [string]$Usuario = "root",
    [string]$Destino = "/var/www/premiacoes-admin"
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$raiz\package.json")) {
    Write-Host "Execute este script da pasta do projeto ou de scripts." -ForegroundColor Red
    exit 1
}

Write-Host "=== Enviando Premiacoes Admin para $Usuario@${Ip}:$Destino ===" -ForegroundColor Green
Write-Host "Pasta local: $raiz" -ForegroundColor Gray

# Criar pasta temporaria SEM node_modules, .next, .git (scp nao suporta exclude)
$deployTemp = Join-Path $env:TEMP "premiacoes-deploy-$(Get-Random)"
if (Test-Path $deployTemp) { Remove-Item $deployTemp -Recurse -Force }
New-Item -ItemType Directory -Path $deployTemp | Out-Null

Write-Host "Copiando arquivos (excluindo node_modules, .next, .git)..." -ForegroundColor Yellow
$robocopy = robocopy $raiz $deployTemp /E /XD node_modules .next .git out .vercel /NFL /NDL /NJH /NJS
if ($robocopy -ge 8) { exit 1 }

Write-Host "Enviando para o servidor..." -ForegroundColor Yellow
try {
    scp -r "$deployTemp\*" "${Usuario}@${Ip}:$Destino"
    if ($LASTEXITCODE -ne 0) { throw "scp falhou" }
    Write-Host "Envio concluido." -ForegroundColor Green
} finally {
    Remove-Item $deployTemp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Proximo passo: conecte ao servidor e rode:" -ForegroundColor Cyan
Write-Host "  ssh $Usuario@$Ip" -ForegroundColor White
Write-Host "  cd $Destino && npm install && npm run build && pm2 restart premiacoes-admin" -ForegroundColor White
