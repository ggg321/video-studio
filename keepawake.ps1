# Prevents Windows from sleeping while Video Studio runs (process-scoped; does NOT change your power settings).
# Stops automatically when this process ends (log off / shutdown / task killed).
Add-Type -Namespace Win -Name Power -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
$ES_CONTINUOUS = 0x80000000; $ES_SYSTEM_REQUIRED = 0x00000001
while ($true) {
  [void][Win.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)
  Start-Sleep -Seconds 60
}
