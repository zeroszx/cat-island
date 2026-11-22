' Klik dua kali file ini untuk menjalankan widget tanpa jendela konsol.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Run """" & dir & "\node_modules\electron\dist\electron.exe"" .", 0, False
