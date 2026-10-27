import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const ACCESS_DB_PATH = 'C:\\Users\\LENOVO\\Documents\\GITHUB HRDMS\\HRMS.accdb';

function runPowerShellScript(psCode) {
  const scriptBuffer = Buffer.from(psCode, 'utf16le');
  const base64Script = scriptBuffer.toString('base64');
  const command = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`;
  return execPromise(command, { maxBuffer: 15 * 1024 * 1024 });
}

export async function queryAccess(sql) {
  const psCode = `
$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${ACCESS_DB_PATH};Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @'
${sql}
'@
$adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
$dt = New-Object System.Data.DataTable
[void]$adapter.Fill($dt)
$conn.Close()
if ($dt.Rows.Count -eq 0) {
    Write-Output "[]"
} else {
    $dt | ConvertTo-Json -Depth 5
}
  `.trim();

  try {
    const { stdout, stderr } = await runPowerShellScript(psCode);
    const output = stdout.trim();
    if (!output || output === '[]') {
      return [];
    }
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error('Access query error:', err.message);
    throw err;
  }
}

export async function executeAccess(sql) {
  const psCode = `
$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${ACCESS_DB_PATH};Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @'
${sql}
'@
$rowsAffected = $cmd.ExecuteNonQuery()
$conn.Close()
Write-Output $rowsAffected
  `.trim();

  try {
    const { stdout } = await runPowerShellScript(psCode);
    return parseInt(stdout.trim(), 10) || 0;
  } catch (err) {
    console.error('Access execute error:', err.message);
    throw err;
  }
}
