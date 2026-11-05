using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern bool SetDllDirectory(string path);

    public static string Html;

    [STAThread]
    private static void Main()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveAssembly;

        try
        {
            Html = BuildHtml();
            PrepareLoader();
        }
        catch (Exception ex)
        {
            MessageBox.Show("初始化失败：" + ex.Message, "扫雷 · 无猜模式");
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }

    private static void PrepareLoader()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        try
        {
            string path = Path.Combine(dir, "WebView2Loader.dll");
            File.WriteAllBytes(path, ReadResource("WebView2Loader.dll"));
            SetDllDirectory(dir);
        }
        catch
        {
            string tmp = Path.Combine(Path.GetTempPath(), "MinesweeperNoGuess");
            Directory.CreateDirectory(tmp);
            File.WriteAllBytes(Path.Combine(tmp, "WebView2Loader.dll"), ReadResource("WebView2Loader.dll"));
            SetDllDirectory(tmp);
        }
    }

    private static string BuildHtml()
    {
        string html = ReadText("index.html");
        string css = ReadText("style.css");
        string js = ReadText("game.js");
        html = html.Replace("<link rel=\"stylesheet\" href=\"style.css\">", "<style>\r\n" + css + "\r\n</style>");
        html = html.Replace("<script src=\"game.js\"></script>", "<script>\r\n" + js + "\r\n</script>");
        return html;
    }

    private static string ReadText(string name)
    {
        return Encoding.UTF8.GetString(ReadResource(name));
    }

    private static Assembly ResolveAssembly(object sender, ResolveEventArgs args)
    {
        string simple = new AssemblyName(args.Name).Name;
        if (simple == "Microsoft.Web.WebView2.Core")
            return Assembly.Load(ReadResource("Microsoft.Web.WebView2.Core.dll"));
        if (simple == "Microsoft.Web.WebView2.WinForms")
            return Assembly.Load(ReadResource("Microsoft.Web.WebView2.WinForms.dll"));
        return null;
    }

    private static byte[] ReadResource(string name)
    {
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        {
            if (s == null) throw new InvalidOperationException("缺少资源: " + name);
            using (var ms = new MemoryStream())
            {
                s.CopyTo(ms);
                return ms.ToArray();
            }
        }
    }
}

internal sealed class MainForm : Form
{
    private readonly WebView2 web;

    public MainForm()
    {
        Text = "扫雷 · 无猜模式";
        Width = 1280;
        Height = 960;
        MinimumSize = new Size(900, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(11, 16, 32);

        web = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(web);

        Load += async (s, e) =>
        {
            try
            {
                string userData = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "UserData");
                try
                {
                    if (!Directory.Exists(userData)) Directory.CreateDirectory(userData);
                }
                catch
                {
                    userData = Path.Combine(Path.GetTempPath(), "MinesweeperNoGuess", "UserData");
                    Directory.CreateDirectory(userData);
                }
                var env = await CoreWebView2Environment.CreateAsync(null, userData, null);
                await web.EnsureCoreWebView2Async(env);
                web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                web.CoreWebView2.NavigateToString(Program.Html);
            }
            catch (Exception ex)
            {
                MessageBox.Show("WebView2 初始化失败：" + ex.Message, "扫雷 · 无猜模式");
            }
        };
    }
}
