<#
Installs (or removes) the free Virtual Display Driver (github.com/VirtualDrivers/Virtual-Display-Driver, signed
through the SignPath Foundation) as one extra, invisible monitor for the sim's pop-out screens.
The Virtual Cockpit server moves the pop-outs onto it and streams them to the Displays tab.

Run elevated (Windows asks for admin rights):
    powershell -ExecutionPolicy Bypass -File tools\virtual_display\install.ps1
    powershell -ExecutionPolicy Bypass -File tools\virtual_display\install.ps1 -Uninstall

Settings go to C:\VirtualDisplayDriver\vdd_settings.xml (the driver's fixed location); the invoking user gets write
access there so the server can switch the monitor on and off without admin rights.
#>
param(
    [switch]$Uninstall,
    [string]$User = $env:USERNAME,
    [string]$Gpu = '',
    [string]$Log = ''
)
$ErrorActionPreference = 'Stop'
$Release = '25.7.23'
$ZipUrl = "https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/download/$Release/VirtualDisplayDriver-x86.Driver.Only.zip"
$HwId = 'Root\MttVDD'
$Home_ = 'C:\VirtualDisplayDriver'
if ($Log) { Start-Transcript -Path $Log -Force | Out-Null }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VcDevice {
    [StructLayout(LayoutKind.Sequential)]
    public struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DISPLAY_DEVICE {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid cls, IntPtr hwnd);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetupDiCreateDeviceInfoW(IntPtr set, string name, ref Guid cls, string desc, IntPtr hwnd, int flags, ref SP_DEVINFO_DATA data);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr set, ref SP_DEVINFO_DATA data, int prop, byte[] buf, int size);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiCallClassInstaller(int fn, IntPtr set, ref SP_DEVINFO_DATA data);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("newdev.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr hwnd, string hwid, string inf, int flags, out bool reboot);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern bool EnumDisplayDevicesW(string device, int index, ref DISPLAY_DEVICE dd, int flags);

    // Root-enumerated device node with the given hardware id (what devcon/nefcon "install" does), then its driver.
    public static bool CreateAndInstall(string hwid, string inf) {
        Guid cls = new Guid("4D36E968-E325-11CE-BFC1-08002BE10318");  // Display
        IntPtr set = SetupDiCreateDeviceInfoList(ref cls, IntPtr.Zero);
        if (set == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
        try {
            SP_DEVINFO_DATA d = new SP_DEVINFO_DATA();
            d.cbSize = Marshal.SizeOf(d);
            if (!SetupDiCreateDeviceInfoW(set, "Display", ref cls, null, IntPtr.Zero, 1 /*DICD_GENERATE_ID*/, ref d))
                throw new System.ComponentModel.Win32Exception();
            byte[] ids = System.Text.Encoding.Unicode.GetBytes(hwid + "\0\0");
            if (!SetupDiSetDeviceRegistryPropertyW(set, ref d, 1 /*SPDRP_HARDWAREID*/, ids, ids.Length))
                throw new System.ComponentModel.Win32Exception();
            if (!SetupDiCallClassInstaller(0x19 /*DIF_REGISTERDEVICE*/, set, ref d))
                throw new System.ComponentModel.Win32Exception();
        } finally { SetupDiDestroyDeviceInfoList(set); }
        return Update(hwid, inf);
    }
    public static bool Update(string hwid, string inf) {
        bool reboot;
        if (!UpdateDriverForPlugAndPlayDevicesW(IntPtr.Zero, hwid, inf, 1 /*INSTALLFLAG_FORCE*/, out reboot))
            throw new System.ComponentModel.Win32Exception();
        return reboot;
    }
    public static string PrimaryAdapter() {
        for (int i = 0; ; i++) {
            DISPLAY_DEVICE dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(dd);
            if (!EnumDisplayDevicesW(null, i, ref dd, 0)) return null;
            if ((dd.StateFlags & 4) != 0) return dd.DeviceString;   // DISPLAY_DEVICE_PRIMARY_DEVICE
        }
    }
}
'@

function Get-VddDevices {
    Get-PnpDevice -PresentOnly:$false -ErrorAction SilentlyContinue |
        Where-Object { $_.HardwareID -contains $HwId -or $_.HardwareID -contains 'MttVDD' }
}

if ($Uninstall) {
    foreach ($d in Get-VddDevices) {
        Write-Output "Removing device $($d.InstanceId)"
        pnputil /remove-device "$($d.InstanceId)" | Out-Host
    }
    $infs = Get-WindowsDriver -Online | Where-Object { $_.OriginalFileName -like '*mttvdd.inf' }
    foreach ($i in $infs) {
        Write-Output "Removing driver package $($i.Driver)"
        pnputil /delete-driver $i.Driver /uninstall /force | Out-Host
    }
    Write-Output 'Virtual display removed. (C:\VirtualDisplayDriver is left in place; delete it if you like.)'
    if ($Log) { Stop-Transcript | Out-Null }
    exit 0
}

# 1. Driver files: pinned release, must carry a valid signature.
$work = Join-Path $Home_ "driver-$Release"
if (-not (Test-Path (Join-Path $work 'MttVDD.inf'))) {
    New-Item -ItemType Directory -Force $Home_ | Out-Null
    $zip = Join-Path $env:TEMP "vdd-$Release.zip"
    Write-Output "Downloading $ZipUrl"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
    $tmp = Join-Path $env:TEMP "vdd-$Release"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp
    $inf = Get-ChildItem -Recurse $tmp -Filter 'MttVDD.inf' | Select-Object -First 1
    New-Item -ItemType Directory -Force $work | Out-Null
    Copy-Item (Join-Path $inf.DirectoryName '*') $work -Force
}
foreach ($f in 'MttVDD.dll', 'mttvdd.cat') {
    $sig = Get-AuthenticodeSignature (Join-Path $work $f)
    if ($sig.Status -ne 'Valid') { throw "$f signature is $($sig.Status); not installing." }
    Write-Output "$f signed by $($sig.SignerCertificate.Subject)"
}

# 2. Settings (the driver reads them when it starts).
if (-not $Gpu) { $Gpu = [VcDevice]::PrimaryAdapter() }
if (-not $Gpu) { $Gpu = 'default' }
$xml = (Get-Content -Raw (Join-Path $PSScriptRoot 'vdd_settings.xml')).Replace('__GPU__', [Security.SecurityElement]::Escape($Gpu))
Set-Content -Path (Join-Path $Home_ 'vdd_settings.xml') -Value $xml -Encoding UTF8
Write-Output "Settings written (GPU: $Gpu)"
if ($User) {
    icacls $Home_ /grant "${User}:(OI)(CI)M" /Q | Out-Null
    Write-Output "Write access for $User on $Home_"
}

# 3. Device + driver.
$infPath = Join-Path $work 'MttVDD.inf'
$existing = Get-VddDevices | Where-Object { $_.Present }
if ($existing) {
    Write-Output 'Device exists; updating its driver'
    $reboot = [VcDevice]::Update($HwId, $infPath)
} else {
    Write-Output 'Creating the virtual display device'
    $reboot = [VcDevice]::CreateAndInstall($HwId, $infPath)
}
Get-VddDevices | Format-Table -AutoSize Status, FriendlyName, InstanceId | Out-Host
if ($reboot) { Write-Output 'Windows asks for a restart to finish.' }
Write-Output 'Done.'
if ($Log) { Stop-Transcript | Out-Null }
