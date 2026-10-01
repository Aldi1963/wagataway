package handler

import _ "embed"

// Font tanda tangan (Great Vibes, SIL OFL) di-embed ke binary agar endpoint
// invoice PDF tidak bergantung pada path file di server.
//go:embed assets/fonts/GreatVibes-Regular.ttf
var signatureFont []byte
