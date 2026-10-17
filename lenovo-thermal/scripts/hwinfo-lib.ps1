# hwinfo-lib.ps1 - dot-source this: . .\hwinfo-lib.ps1
# Robust HWiNFO CSV parsing. Handles: ANSI encoding, the degree sign, mid-log sensor-set
# changes, column-shifted rows, duplicate column names, and the trailing header block.
# See reference/pitfalls.md for why each of these matters.

function Read-HwinfoCsv {
    <#
      Returns [pscustomobject] with:
        Header   - string[] of ASCII-normalized column names
        Rows     - array of string[] (validated, aligned)
        Dropped  - count of rejected rows
        Total    - count of candidate data rows
        FanCol   - index of a fan/RPM column, or -1
    #>
    param([Parameter(Mandatory)][string]$Path)

    $lines = Get-Content -LiteralPath $Path -Encoding Default
    if ($lines.Count -lt 2) { throw "empty or unreadable: $Path" }

    # ASCII-normalize header names so the degree sign cannot break matching
    $header = @(($lines[0] -split ',') | ForEach-Object { ($_.Trim('"').Trim()) -replace '[^\x20-\x7E]','' })
    $nf = $header.Count
    $isFlag = @($header | ForEach-Object { $_ -like '*[[]Yes/No[]]*' })

    $rowsOut = New-Object System.Collections.Generic.List[object]
    $dropped = 0
    $total = 0
    for ($i = 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -like 'Date,*') { continue }          # trailing/interior header block
        $total++
        $f = @(($line -split ',') | ForEach-Object { $_.Trim('"').Trim() })
        if ($f.Count -ne $nf) { $dropped++; continue }
        # row-level alignment validation
        $ok = $true
        for ($j = 2; $j -lt $nf; $j++) {
            $v = $f[$j]
            if ($v -eq '') { continue }
            if ($isFlag[$j]) {
                if ($v -ne 'Yes' -and $v -ne 'No') { $ok = $false; break }
            } else {
                $d = 0.0
                if (-not [double]::TryParse($v, [ref]$d)) { $ok = $false; break }
            }
        }
        if (-not $ok) { $dropped++; continue }
        $rowsOut.Add($f)
    }

    $fanCol = -1
    for ($k = 0; $k -lt $nf; $k++) { if ($header[$k] -match 'Fan|RPM|Tach') { $fanCol = $k; break } }

    return [pscustomobject]@{
        Header = $header; Rows = $rowsOut.ToArray(); Dropped = $dropped
        Total = $total; FanCol = $fanCol; Path = $Path
    }
}

function Get-ColIndex {
    # First column whose ASCII-normalized name matches the -like pattern. -1 if absent.
    # Remember: use '[C]' not the degree sign. Duplicates exist; first wins.
    param([Parameter(Mandatory)]$Log, [Parameter(Mandatory)][string]$Pattern)
    for ($i = 0; $i -lt $Log.Header.Count; $i++) {
        if ($Log.Header[$i] -like $Pattern) { return $i }
    }
    return -1
}

function Get-ColValues {
    param([Parameter(Mandatory)]$Log, [Parameter(Mandatory)][int]$Index)
    $out = New-Object System.Collections.Generic.List[double]
    if ($Index -lt 0) { return $out }
    foreach ($r in $Log.Rows) {
        $d = 0.0
        if ([double]::TryParse($r[$Index], [ref]$d)) { $out.Add($d) }
    }
    return $out
}

function Get-ColStats {
    param([Parameter(Mandatory)]$Log, [Parameter(Mandatory)][string]$Pattern)
    $i = Get-ColIndex -Log $Log -Pattern $Pattern
    if ($i -lt 0) { return $null }
    $v = Get-ColValues -Log $Log -Index $i
    if ($v.Count -eq 0) { return $null }
    $s = @($v | Sort-Object)
    $n = $s.Count
    return [pscustomobject]@{
        Name = $Log.Header[$i]; Index = $i; N = $n
        Avg = [math]::Round((($v | Measure-Object -Average).Average), 2)
        Min = [math]::Round($s[0], 2)
        P50 = [math]::Round($s[[int]($n * 0.50)], 2)
        P95 = [math]::Round($s[[math]::Min($n - 1, [int]($n * 0.95))], 2)
        Max = [math]::Round($s[$n - 1], 2)
    }
}

function Get-FlagPct {
    # Percent of samples where a [Yes/No] column is Yes.
    param([Parameter(Mandatory)]$Log, [Parameter(Mandatory)][string]$Pattern)
    $i = Get-ColIndex -Log $Log -Pattern $Pattern
    if ($i -lt 0) { return $null }
    $y = 0; $t = 0
    foreach ($r in $Log.Rows) {
        if ($r[$i] -eq 'Yes') { $y++; $t++ }
        elseif ($r[$i] -eq 'No') { $t++ }
    }
    if ($t -eq 0) { return $null }
    return [pscustomobject]@{ Name = $Log.Header[$i]; Yes = $y; Total = $t; Pct = [math]::Round(100.0 * $y / $t, 1) }
}

function Get-Correlation {
    param([Parameter(Mandatory)]$X, [Parameter(Mandatory)]$Y)
    $n = [math]::Min($X.Count, $Y.Count)
    if ($n -lt 10) { return $null }
    $mx = 0.0; $my = 0.0
    for ($i = 0; $i -lt $n; $i++) { $mx += $X[$i]; $my += $Y[$i] }
    $mx = $mx / $n; $my = $my / $n
    $sxy = 0.0; $sxx = 0.0; $syy = 0.0
    for ($i = 0; $i -lt $n; $i++) {
        $dx = $X[$i] - $mx; $dy = $Y[$i] - $my
        $sxy += $dx * $dy; $sxx += $dx * $dx; $syy += $dy * $dy
    }
    if ($sxx -eq 0 -or $syy -eq 0) { return $null }
    return [math]::Round($sxy / [math]::Sqrt($sxx * $syy), 3)
}

function ConvertTo-SecondOfDay {
    # HWiNFO writes H:m:s.fff (no zero padding). Returns -1 if unparseable.
    param([string]$TimeText)
    $p = $TimeText -split ':'
    if ($p.Count -lt 3) { return -1 }
    $sec = 0.0
    if (-not [double]::TryParse(($p[2] -replace ',', '.'), [ref]$sec)) { return -1 }
    return ([int]$p[0]) * 3600 + ([int]$p[1]) * 60 + $sec
}

function Get-SmoothedSeries {
    # EMA - temperature lags power, so smooth power before regressing temp on it.
    param([Parameter(Mandatory)]$Values, [double]$Alpha = 0.15)
    $out = New-Object System.Collections.Generic.List[double]
    $ema = $null
    foreach ($v in $Values) {
        if ($null -eq $ema) { $ema = $v } else { $ema = $Alpha * $v + (1 - $Alpha) * $ema }
        $out.Add($ema)
    }
    return $out
}

function Get-LinearFit {
    # Returns Slope / Intercept / R2 for Y = Intercept + Slope*X
    param([Parameter(Mandatory)]$X, [Parameter(Mandatory)]$Y)
    $n = [math]::Min($X.Count, $Y.Count)
    if ($n -lt 10) { return $null }
    $mx = 0.0; $my = 0.0
    for ($i = 0; $i -lt $n; $i++) { $mx += $X[$i]; $my += $Y[$i] }
    $mx = $mx / $n; $my = $my / $n
    $sxy = 0.0; $sxx = 0.0; $syy = 0.0
    for ($i = 0; $i -lt $n; $i++) {
        $dx = $X[$i] - $mx; $dy = $Y[$i] - $my
        $sxy += $dx * $dy; $sxx += $dx * $dx; $syy += $dy * $dy
    }
    if ($sxx -eq 0) { return $null }
    $slope = $sxy / $sxx
    $r = 0.0
    if ($syy -gt 0) { $r = $sxy / [math]::Sqrt($sxx * $syy) }
    return [pscustomobject]@{
        Slope = [math]::Round($slope, 3); Intercept = [math]::Round($my - $slope * $mx, 2)
        R2 = [math]::Round($r * $r, 3); N = $n
    }
}
