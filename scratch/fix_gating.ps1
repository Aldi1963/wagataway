$path = "c:\xampp\htdocs\SaaS-Gateway-Pro-2zip\artifacts\wa-gateway\src\pages\BotProducts.tsx"
$content = Get-Content $path -Raw

# Clean up any mess from previous attempts first
$content = $content -replace '(?s)<Tabs value=\{tab\} onValueChange=\{setTab\} className="space-y-6">.*<TabsList', '<Tabs value={tab} onValueChange={setTab} className="space-y-6">`n          <TabsList'

# Inject the gate
$gate = '        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          {!isPremium && tab === "settings" ? (
            <Card className="rounded-[40px] border-none shadow-2xl overflow-hidden relative group">
              <CardContent className="p-20 text-center relative z-10 flex flex-col items-center justify-center space-y-6">
                <div className="w-24 h-24 bg-primary/10 rounded-[32px] flex items-center justify-center">
                  <ShoppingCart className="w-12 h-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black tracking-tight">Commerce Center Premium</h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">Fitur automasi pesanan, cek ongkir RajaOngkir, dan manajemen katalog AI hanya tersedia pada paket *Enterprise*.</p>
                  <Button className="mt-4 rounded-xl font-bold" onClick={() => window.location.href=`/billing`}>Buka Akses Premium Sekarang</Button>
                </div>
              </CardContent>
            </Card>
          ) : ('

$content = $content -replace '        <Tabs value=\{tab\} onValueChange=\{setTab\} className="space-y-6">', $gate

# Handle the closing part
$content = $content -replace '(?s)</TabsContent>\s+</Tabs>', "</TabsContent>`n          )}`n        </Tabs>"

Set-Content $path $content -NoNewline
