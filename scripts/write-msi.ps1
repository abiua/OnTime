$ErrorActionPreference = 'Stop'
$installer = New-Object -ComObject WindowsInstaller.Installer
$work = (Get-Location).Path
$db = $installer.OpenDatabase([IO.Path]::Combine($work, 'OnTime.msi'), 3)
foreach ($table in Get-ChildItem -Filter '*.idt') {
    try { $db.Import($work, $table.Name) }
    catch { throw "Failed to import $($table.Name): $_" }
}
function Add-Stream($Sql, $Key, $File) {
    $record = $installer.CreateRecord(2)
    $record.StringData(1) = $Key
    $record.SetStream(2, [IO.Path]::Combine($work, $File))
    $view = $db.OpenView($Sql)
    $view.Execute($record)
    $view.Close()
}
$view = $db.OpenView('CREATE TABLE `Icon` (`Name` CHAR(72) NOT NULL, `Data` OBJECT NOT NULL PRIMARY KEY `Name`)')
$view.Execute()
$view.Close()
Add-Stream 'INSERT INTO `Icon` (`Name`, `Data`) VALUES (?, ?)' 'AppIcon' 'AppIcon.ico'
Add-Stream 'INSERT INTO `_Streams` (`Name`, `Data`) VALUES (?, ?)' 'payload.cab' 'payload.cab'
$summary = $db.SummaryInformation(10)
$summary.Property(2) = 'Installation Database'
$summary.Property(3) = 'OnTime desktop launcher'
$summary.Property(4) = 'OnTime contributors'
$summary.Property(7) = 'x64;1033'
$summary.Property(9) = [guid]::NewGuid().ToString('B').ToUpperInvariant()
$summary.Property(14) = 500
# Compressed files, per-user package requiring standard user privileges.
$summary.Property(15) = 10
$summary.Persist()
$db.Commit()
