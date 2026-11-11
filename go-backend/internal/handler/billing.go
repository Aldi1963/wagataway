package handler

import (
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/subscription"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func registerBillingRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB, wm waSender) {
	// GET /api/quota — info kuota pesan bulanan (Fitur 3), alias ringan dari
	// /api/billing/usage untuk dipakai dashboard & integrasi.
	rg.GET("/quota", getBillingUsage(db))
	// Grup /billing dikunci scope "billing": key lama tanpa scope tercatat
	// (NULL) di-grandfather sebagai full di ParseAPIKeyScopes, jadi
	// integrasi lama tetap lolos; hanya key berscope eksplisit tanpa
	// "billing" (mis. messages:send saja) yang ditolak 403. Request JWT
	// (dashboard) tidak dibatasi scope. GET /api/quota di luar grup ini
	// sengaja dibiarkan apa adanya.
	b := rg.Group("/billing", middleware.RequireScope("billing"))
	{
		b.GET("/plans", listPlans(db))
		b.GET("/subscription", getSubscription(db))
		b.GET("/usage", getBillingUsage(db))
		b.POST("/subscribe", createSubscription(cfg, db, wm))
		// Fitur 4: kalkulasi ganti paket prorata (tanpa efek samping)
		b.GET("/prorate", getProrateQuote(db))
		b.GET("/transactions", listTransactions(db))
		b.GET("/transactions/:id", getBillingTransaction(cfg, db, wm))
		b.GET("/transactions/:id/invoice.pdf", getInvoicePDF(db))
		b.POST("/voucher/redeem", redeemVoucher(db))
		b.GET("/voucher/redemptions", listVoucherRedemptions(db))
		// Tagihan pelanggan (Item 3): invoice + QRIS Clipku Pay di WA.
		registerCustomerInvoiceRoutes(b, cfg, db, wm)
	}
}

func listPlans(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var plans []models.Plan
		db.Where("is_active = ?", true).Order("sort_order ASC").Find(&plans)
		c.JSON(http.StatusOK, gin.H{"plans": plans})
	}
}

func getSubscription(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		// BONUS (tanggal expired asli di dashboard): sertakan status langganan
		// terpusat (active | grace | expired) dari subscription.Check, agar kartu
		// dashboard bisa menampilkan badge "Masa Tenggang" / "Berakhir".
		subState := string(subscription.StateActive)
		if st, err := subscription.Check(udb, userID); err == nil && st != nil {
			subState = string(st.State)
		}
		var sub models.Subscription
		// Langganan yang SEDANG berjalan: jendela waktunya mengandung
		// sekarang. Baris 'scheduled' (voucher mengantre) yang jendelanya
		// belum mulai — dan baris yang jendelanya sudah lewat — tidak
		// ditampilkan sebagai langganan aktif.
		now := time.Now()
		err := udb.Where("user_id = ? AND status IN ? AND start_date <= ? AND end_date > ?",
			userID, []string{"active", "scheduled"}, now, now).
			Preload("Plan").Order("start_date ASC").First(&sub).Error
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"subscription": nil, "subState": subState})
			return
		}
		c.JSON(http.StatusOK, gin.H{"subscription": subscriptionWithState{
			Subscription: sub,
			SubState:     subState,
		}})
	}
}

// subscriptionWithState: langganan + status terpusat untuk kartu dashboard.
type subscriptionWithState struct {
	models.Subscription
	SubState string `json:"subState"`
}

// GET /api/billing/usage — kuota paket & pemakaian pesan bulan ini (Fitur 3).
// Memakai quota.Check terpusat: limit dari plan.monthly_message_limit
// (0 = unlimited), pemakaian = pesan outgoing bulan berjalan berstatus
// sent/delivered/read. Field lama (planName, quota, usedThisMonth, remaining)
// dipertahankan untuk kompatibilitas.
func getBillingUsage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		qr, err := quota.Check(udb, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membaca kuota", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"planName":      qr.PlanName,
			"quota":         qr.Limit,
			"usedThisMonth": qr.Used,
			"remaining":     qr.Remaining(),
			"limit":         qr.Limit,
			"isUnlimited":   qr.Unlimited,
			"percentUsed":   qr.Percent(),
			"warning":       qr.Warning, // true bila pemakaian >= 80%
			"isTrial":       qr.IsTrial,
			"quotaExceeded": !qr.Allowed,
			// Status langganan terpusat (Fitur 5): active | grace | expired.
			"subState":        qr.SubState,
			"graceDaysLeft":   qr.SubGraceDaysLeft,
			"graceUsedToday":  qr.SubGraceUsed,
			"graceDailyLimit": qr.SubGraceLimit,
		})
	}
}

// newBillingOrderID membuat ID order unik untuk Clipku Pay:
// WAG-<userID>-<UnixNano>-<acak hex>. Unix detik saja (format lama)
// bertabrakan bila dua langganan dibuat dalam detik yang sama; UnixNano +
// suffix acak menutup celah itu. ExternalID unik di DB (uniqueIndex).
func newBillingOrderID(userID uint) string {
	var rb [3]byte
	if _, err := rand.Read(rb[:]); err != nil {
		return fmt.Sprintf("WAG-%d-%d", userID, time.Now().UnixNano())
	}
	return fmt.Sprintf("WAG-%d-%d-%x", userID, time.Now().UnixNano(), rb)
}

func createSubscription(cfg *config.Config, db *gorm.DB, wm waSender) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			PlanID uint `json:"planId" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Plan wajib dipilih"})
			return
		}

		var plan models.Plan
		if err := udb.Where("id = ? AND is_active = ?", req.PlanID, true).First(&plan).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Paket tidak ditemukan"})
			return
		}

		// Fitur 4 (prorata): bila user punya langganan aktif yang belum
		// expired dan memilih paket BERBEDA, hitung sisa nilai paket lama.
		q, err := prorateQuote(udb, userID, &plan)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghitung prorata"})
			return
		}
		amount := q.PayableAmount
		metadata := ""
		if q.Prorate {
			metadata = prorateMetadataJSON(q)
		}

		// Fitur 4: sisa nilai menutupi penuh (atau paket tujuan gratis) →
		// bayar 0, langsung aktif tanpa ke Clipku Pay. Aktivasi lewat
		// activateSubscription (titik yang sama dipakai webhook & sinkronisasi
		// status), yang menonaktifkan langganan lama dan membuat yang baru
		// mulai sekarang.
		if q.Prorate && amount == 0 {
			tx := models.Transaction{
				UserID:        userID,
				PlanID:        &req.PlanID,
				Amount:        0,
				Status:        "pending",
				PaymentMethod: "clipkupay",
				ExternalID:    newBillingOrderID(userID),
				Metadata:      metadata,
			}
			if err := udb.Create(&tx).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat transaksi"})
				return
			}
			if activated, err := activateSubscription(udb, tx.ID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengaktifkan paket"})
				return
			} else if activated {
				// Fitur 6: tepat di momen transisi → paid (prorata bayar-0).
				// Error notifikasi tidak menggagalkan aktivasi.
				_ = notifyPaymentSuccess(udb, wm, tx.ID)
				// Item 8: event webhook outbound subscription.activated.
				fireSubscriptionActivated(udb, wm, tx.ID)
			}
			c.JSON(http.StatusCreated, gin.H{
				"transaction": tx,
				"plan":        plan,
				"quote":       q,
				"activated":   true,
				"message":     "Paket berhasil diganti — sisa nilai paket lama menutupi penuh",
			})
			return
		}

		if plan.Price <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Paket gratis tidak perlu pembayaran"})
			return
		}

		kp := newClipkuPay(cfg, udb)
		if !kp.enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"message": "Payment gateway belum dikonfigurasi"})
			return
		}

		var user models.User
		if err := udb.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "User tidak ditemukan"})
			return
		}

		orderID := newBillingOrderID(userID)

		// Catat transaksi lokal dulu sebagai pending
		tx := models.Transaction{
			UserID:        userID,
			PlanID:        &req.PlanID,
			Amount:        amount,
			Status:        "pending",
			PaymentMethod: "clipkupay",
			ExternalID:    orderID,
			Metadata:      metadata,
		}
		if err := udb.Create(&tx).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat transaksi"})
			return
		}

		// Buat transaksi di Clipku Pay
		data, err := kp.createTransaction(orderID, amount, user.Name, user.Email)
		if err != nil {
			udb.Model(&tx).Update("status", "failed")
			c.JSON(http.StatusBadGateway, gin.H{"message": "Gagal membuat pembayaran: " + err.Error()})
			return
		}
		udb.Model(&tx).Updates(map[string]any{"payment_ref": data.PaymentURL})

		c.JSON(http.StatusCreated, gin.H{
			"transaction": tx,
			"plan":        plan,
			"quote":       q,
			"orderId":     orderID,
			"paymentUrl":  data.PaymentURL,
			"qrUrl":       data.QrURL,
			"message":     "Transaksi dibuat, silakan selesaikan pembayaran",
		})
	}
}

// GET /api/billing/transactions/:id — cek status + sinkron dari Clipku Pay bila pending.
func getBillingTransaction(cfg *config.Config, db *gorm.DB, wm waSender) gin.HandlerFunc {
	kp := newClipkuPay(cfg, db)
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var tx models.Transaction
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).
			Preload("Plan").First(&tx).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Transaksi tidak ditemukan"})
			return
		}

		// Sinkronkan status dari Clipku Pay bila masih pending
		if tx.Status == "pending" && tx.ExternalID != "" && kp.enabled() {
			if remote, err := kp.getTransaction(tx.ExternalID); err == nil {
				if clipkuIsPaid(remote.Status) {
					// Nominal remote yang diketahui tidak boleh kurang dari
					// tagihan (celah yang sama seperti webhook): jangan
					// aktifkan dari pembayaran kurang, biarkan pending.
					if clipkuAmountSufficient(remote, tx.Amount) {
						// Fitur 6: tepat di momen transisi → paid. Error
						// notifikasi tidak menggagalkan sinkronisasi.
						if activated, _ := activateSubscription(udb, tx.ID); activated {
							_ = notifyPaymentSuccess(udb, wm, tx.ID)
							// Item 8: event webhook outbound subscription.activated.
							fireSubscriptionActivated(udb, wm, tx.ID)
						}
						udb.Where("id = ?", tx.ID).Preload("Plan").First(&tx)
					}
				} else {
					st := strings.ToLower(strings.TrimSpace(remote.Status))
					if st == "expired" || st == "failed" || st == "cancelled" {
						udb.Model(&tx).Update("status", st)
						tx.Status = st
					}
				}
			}
		}
		tx.InvoiceNumber = invoiceNumber(tx.ID, tx.CreatedAt)
		c.JSON(http.StatusOK, gin.H{"transaction": tx})
	}
}

func listTransactions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var txs []models.Transaction
		udb.Where("user_id = ?", userID).Preload("Plan").
			Order("created_at DESC").Limit(50).Find(&txs)
		for i := range txs {
			txs[i].InvoiceNumber = invoiceNumber(txs[i].ID, txs[i].CreatedAt)
		}
		c.JSON(http.StatusOK, gin.H{"transactions": txs})
	}
}

// invoiceNumber mengembalikan nomor invoice deterministik dari ID transaksi.
// Memakai tahun & bulan dari CreatedAt sehingga stabil (tidak berubah antar
// request) tanpa perlu kolom baru di DB.
func invoiceNumber(txID uint, createdAt time.Time) string {
	romans := [12]string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}
	m := int(createdAt.Month())
	if m < 1 || m > 12 {
		m = 1
	}
	return fmt.Sprintf("INV/%04d/%s/%06d", createdAt.Year(), romans[m-1], txID)
}

// errAlreadyRedeemed menandai percobaan redeem ganda oleh user yang sama.
var errAlreadyRedeemed = errors.New("voucher already redeemed by user")

// errVoucherExhausted menandai voucher yang kuotanya habis saat penukaran
// (terdeteksi di dalam transaksi, setelah kunci baris).
var errVoucherExhausted = errors.New("voucher exhausted")

// errVoucherNewUsersOnly menandai percobaan redeem voucher khusus
// pengguna baru oleh user yang masih punya langganan aktif.
var errVoucherNewUsersOnly = errors.New("voucher khusus pengguna baru")

func redeemVoucher(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Code string `json:"code" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Kode voucher wajib"})
			return
		}

		// Kode dibuat admin dalam huruf besar — samakan normalisasinya
		// supaya "abc123" / " abc123 " tetap ketemu.
		code := strings.ToUpper(strings.TrimSpace(req.Code))
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Kode voucher wajib"})
			return
		}

		var voucher models.Voucher
		if err := udb.Where("code = ? AND is_active = ?", code, true).First(&voucher).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Voucher tidak valid atau sudah tidak aktif"})
			return
		}

		if voucher.MaxUses > 0 && voucher.UsedCount >= voucher.MaxUses {
			c.JSON(http.StatusConflict, gin.H{"message": "Voucher sudah habis dipakai"})
			return
		}

		if voucher.ExpiresAt != nil && voucher.ExpiresAt.Before(java_time_now()) {
			c.JSON(http.StatusGone, gin.H{"message": "Voucher sudah kadaluarsa"})
			return
		}

		// Jendela berlaku (Item 3): berlaku DI SAMPING ExpiresAt — pesan
		// dibedakan dari "sudah kadaluarsa" supaya admin/user tahu ini
		// soal jadwal mulai/berakhir, bukan tanggal kedaluwarsa voucher.
		now := java_time_now()
		if voucher.StartsAt != nil && now.Before(*voucher.StartsAt) {
			c.JSON(http.StatusForbidden, gin.H{"message": "Voucher belum berlaku"})
			return
		}
		if voucher.EndsAt != nil && now.After(*voucher.EndsAt) {
			c.JSON(http.StatusGone, gin.H{"message": "Voucher sudah berakhir"})
			return
		}

		// Voucher diskon belum punya mekanisme penerapan (tidak ada tempat
		// menyimpan diskon untuk pembayaran berikutnya) — tolak dengan jelas
		// daripada mencatat penukaran yang tidak memberi apa-apa.
		if voucher.Type == "discount" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Voucher diskon belum dapat digunakan"})
			return
		}

		// Voucher khusus pengguna baru: hanya untuk yang belum pernah
		// berlangganan atau langganannya sudah habis (tidak ada langganan
		// aktif saat ini). Dicek ulang di dalam transaksi di bawah agar
		// aktivasi langganan yang berjalan bersamaan tidak lolos.
		if voucher.NewUsersOnly {
			active, err := subscription.HasActiveSubscription(udb, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menggunakan voucher"})
				return
			}
			if active {
				c.JSON(http.StatusForbidden, gin.H{"message": "Voucher ini khusus pengguna baru atau yang langganannya sudah habis"})
				return
			}
		}

		// Siapkan paket yang akan diberikan (trial memakai paket acuan bila
		// voucher tidak menunjuk paket tertentu).
		plan, durationDays, isTrial, err := voucherGrantPlan(udb, &voucher)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
			return
		}

		// Paket minimal (MinPlanID): bandingkan dengan paket yang AKAN
		// diberikan voucher ini — bukan paket user saat ini. Trial tanpa
		// PlanID memberi paket Free (tier terendah), jadi voucher trial
		// bermininum Pro otomatis ditolak; trial ber-PlanID Pro/Master
		// lolos. Voucher diskon sudah ditolak di atas, tidak sampai sini.
		if err := checkVoucherMinPlan(udb, &voucher, plan); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
			return
		}

		// Cek + catat redeem + increment used_count + terapkan efek voucher
		// berjalan atomik dalam satu transaksi.
		var startsAt, endsAt time.Time
		err = udb.Transaction(func(tx *gorm.DB) error {
			var err error
			startsAt, endsAt, err = redeemVoucherTx(tx, userID, &voucher, plan, durationDays, isTrial, now)
			return err
		})
		if err != nil {
			if errors.Is(err, errVoucherExhausted) {
				c.JSON(http.StatusConflict, gin.H{"message": "Voucher sudah habis dipakai"})
				return
			}
			if errors.Is(err, errAlreadyRedeemed) {
				c.JSON(http.StatusConflict, gin.H{"message": "Voucher ini sudah pernah Anda gunakan"})
				return
			}
			if errors.Is(err, errVoucherNewUsersOnly) {
				c.JSON(http.StatusForbidden, gin.H{"message": "Voucher ini khusus pengguna baru atau yang langganannya sudah habis"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menggunakan voucher"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":      "Voucher berhasil digunakan",
			"voucher":      voucher,
			"planName":     plan.Name,
			"durationDays": durationDays,
			// startsAt > now berarti langganan MENGANTRE: mulai berlaku
			// setelah langganan (dan antrean) yang sudah ada berakhir.
			// endsAt = akhir langganan baru ini, bukan akhir antrean.
			"startsAt": startsAt,
			"endsAt":   endsAt,
			"queued":   startsAt.After(now),
		})
	}
}

// redeemVoucherTx menjalankan inti penukaran voucher di dalam satu
// transaksi: kunci baris voucher (SELECT ... FOR UPDATE), cek ulang kuota,
// catat penukaran, increment kondisional, lalu berikan langganan.
// Mengembalikan jendela (startsAt, endsAt) langganan yang diberikan —
// startsAt bisa di masa depan bila voucher mengantre (lihat
// grantVoucherSubscription).
//
// Kunci baris + increment kondisional (WHERE used_count < max_uses) menutup
// balapan dua request bersamaan yang sama-sama lolos cek MaxUses di luar
// transaksi: request kedua antre pada kunci baris, lalu melihat kuota yang
// sudah habis; increment kondisional menjadi penjaga terakhir bila MaxUses
// berubah di tengah jalan (mis. admin menurunkan kuota saat transaksi
// berjalan) — RowsAffected=0 membatalkan seluruh transaksi.
func redeemVoucherTx(tx *gorm.DB, userID uint, voucher *models.Voucher, plan models.Plan, durationDays int, isTrial bool, now time.Time) (startsAt time.Time, endsAt time.Time, err error) {
	// Kunci baris voucher: request lain yang mengincar voucher yang sama
	// antre di sini sampai transaksi ini selesai.
	var locked models.Voucher
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", voucher.ID).First(&locked).Error; err != nil {
		return time.Time{}, time.Time{}, err
	}
	if locked.MaxUses > 0 && locked.UsedCount >= locked.MaxUses {
		return time.Time{}, time.Time{}, errVoucherExhausted
	}

	// Syarat pengguna baru dicek ulang di dalam transaksi: kunci baris
	// user dulu agar aktivasi langganan yang berjalan bersamaan (mis.
	// pembayaran paket lain yang commit di antara cek luar dan pemberian
	// langganan di bawah) tidak lolos. Kunci ini juga dipakai
	// grantVoucherSubscription di bawah — dalam satu transaksi yang sama,
	// penguncian ulang baris yang sama adalah no-op.
	if voucher.NewUsersOnly {
		var lockedUser models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return time.Time{}, time.Time{}, err
		}
		active, err := subscription.HasActiveSubscription(tx, userID)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
		if active {
			return time.Time{}, time.Time{}, errVoucherNewUsersOnly
		}
	}

	var count int64
	if err := tx.Model(&models.VoucherRedemption{}).
		Where("voucher_id = ? AND user_id = ?", voucher.ID, userID).
		Count(&count).Error; err != nil {
		return time.Time{}, time.Time{}, err
	}
	if count > 0 {
		return time.Time{}, time.Time{}, errAlreadyRedeemed
	}

	if err := tx.Create(&models.VoucherRedemption{
		VoucherID: voucher.ID,
		UserID:    userID,
	}).Error; err != nil {
		// Balapan dua request bersamaan: unique index gabungan
		// menjadi penjaga terakhir.
		if strings.Contains(err.Error(), "duplicate key") {
			return time.Time{}, time.Time{}, errAlreadyRedeemed
		}
		return time.Time{}, time.Time{}, err
	}

	// Increment kondisional: RowsAffected=0 berarti kuota habis →
	// batalkan seluruh transaksi (termasuk pencatatan redeem di atas).
	res := tx.Model(&models.Voucher{}).
		Where("id = ? AND (max_uses = 0 OR used_count < max_uses)", voucher.ID).
		Update("used_count", gorm.Expr("used_count + 1"))
	if res.Error != nil {
		return time.Time{}, time.Time{}, res.Error
	}
	if res.RowsAffected == 0 {
		return time.Time{}, time.Time{}, errVoucherExhausted
	}

	// Berikan langganan (mengantre bila sudah ada langganan aktif).
	return grantVoucherSubscription(tx, userID, plan, durationDays, isTrial, now)
}

// planTierBelow melaporkan apakah paket yang diberikan tier-nya DI BAWAH
// paket minimum. Tier diukur dari SortOrder — urutan kanonis paket yang
// dipakai listPlans, adminListPackages, dan daftar paket publik. Data live
// konsisten: SortOrder naik seiring harga (Free 1/0, Lite 2/25000, Regular
// 3/66000, Pro 4/110000, Master 5/175000), jadi SortOrder saja sudah
// menentukan tier; Price hanya penyeimbang bila dua paket berbagi
// SortOrder yang sama (mis. paket baru yang belum diurutkan admin).
func planTierBelow(granted, min models.Plan) bool {
	if granted.SortOrder != min.SortOrder {
		return granted.SortOrder < min.SortOrder
	}
	return granted.Price < min.Price
}

// checkVoucherMinPlan menolak redeem bila paket yang akan diberikan voucher
// tier-nya di bawah paket minimal voucher (MinPlanID). Tanpa MinPlanID
// voucher berlaku untuk semua paket. Bila baris paket minimum sudah tidak
// ada lagi (dihapus admin setelah voucher dibuat), batas tidak bisa diukur
// — voucher dianggap berlaku untuk semua paket, bukan ditolak, karena
// penghapusan paket tidak seharusnya mematikan voucher yang sudah beredar.
func checkVoucherMinPlan(udb *gorm.DB, voucher *models.Voucher, granted models.Plan) error {
	if voucher.MinPlanID == nil {
		return nil
	}
	var min models.Plan
	if err := udb.Where("id = ?", *voucher.MinPlanID).First(&min).Error; err != nil {
		return nil
	}
	if planTierBelow(granted, min) {
		return fmt.Errorf("Voucher ini hanya berlaku untuk paket %s ke atas", min.Name)
	}
	return nil
}

// voucherGrantPlan menentukan paket + durasi + status trial yang diberikan
// sebuah voucher. Trial memakai paket yang ditunjuk voucher bila ada, kalau
// tidak memakai paket Free sebagai acuan (kuota trial tetap mengikuti
// TrialMonthlyLimit, bukan limit paket acuan).
func voucherGrantPlan(udb *gorm.DB, voucher *models.Voucher) (models.Plan, int, bool, error) {
	var plan models.Plan
	switch voucher.Type {
	case "trial":
		durationDays := voucher.Duration
		if durationDays <= 0 {
			durationDays = 7
		}
		if voucher.PlanID != nil {
			if err := udb.Where("id = ? AND is_active = ?", *voucher.PlanID, true).First(&plan).Error; err != nil {
				return plan, 0, false, errors.New("Paket acuan voucher trial tidak ditemukan")
			}
			return plan, durationDays, true, nil
		}
		if err := udb.Where("slug = ? AND is_active = ?", "free", true).First(&plan).Error; err != nil {
			return plan, 0, false, errors.New("Paket trial tidak tersedia")
		}
		return plan, durationDays, true, nil
	case "plan":
		if voucher.PlanID == nil {
			return plan, 0, false, errors.New("Voucher paket tidak memiliki paket yang valid")
		}
		if err := udb.Where("id = ? AND is_active = ?", *voucher.PlanID, true).First(&plan).Error; err != nil {
			return plan, 0, false, errors.New("Paket voucher tidak ditemukan atau tidak aktif")
		}
		durationDays := voucher.Duration
		if durationDays <= 0 {
			durationDays = plan.Duration
		}
		if durationDays <= 0 {
			durationDays = 30
		}
		return plan, durationDays, false, nil
	default:
		return plan, 0, false, errors.New("Tipe voucher tidak dikenal")
	}
}

// grantVoucherSubscription memberikan langganan dari voucher —
// MEMPERPANJANG / MENGANTRE, bukan menimpa (keputusan user 11 Nov 2026,
// menggantikan konvensi lama "nonaktifkan yang lama, mulai sekarang").
//
//   - Tidak ada langganan yang masih berjalan → langganan baru mulai
//     sekarang (status 'active'), users.plan disinkronkan.
//   - Ada langganan aktif / sudah mengantre → langganan baru mulai di
//     ends_at TERAKHIR antrean (status 'scheduled'), berakhir di ujung
//     antrean + durationDays. Langganan lama TIDAK dinonaktifkan — tetap
//     aktif sampai jendelanya berakhir. users.plan TIDAK diubah: paket &
//     kuota yang tampil tetap mengikuti langganan yang sedang berjalan;
//     yang mengantre diterapkan scheduler saat jendelanya mulai (lihat
//     worker.activateDueScheduledSubscriptions). Pembaca kuota/status
//     (quota.effectiveLimit, subscription.Check) menentukan langganan
//     aktif dari jendela waktu, jadi baris 'scheduled' yang jendelanya
//     sudah mulai tetap terbaca benar walau scheduler sempat tertinggal.
//
// Mengembalikan jendela (startsAt, endsAt) langganan yang dibuat.
//
// Race: baris user dikunci (SELECT ... FOR UPDATE) sebelum membaca ujung
// antrean, sehingga dua redeem bersamaan (voucher berbeda) untuk user yang
// sama diserialisasi — yang kedua baru membaca antrean setelah yang pertama
// commit, jadi voucher kedua mengantre di belakang yang pertama, bukan
// menimpanya. Urutan kunci konsisten (baris voucher dulu di
// redeemVoucherTx, lalu baris user di sini) di semua jalur.
func grantVoucherSubscription(tx *gorm.DB, userID uint, plan models.Plan, durationDays int, isTrial bool, now time.Time) (time.Time, time.Time, error) {
	var lockedUser models.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", userID).First(&lockedUser).Error; err != nil {
		return time.Time{}, time.Time{}, err
	}

	// Ujung antrean: ends_at TERAKHIR di antara langganan yang masih
	// berjalan atau sudah mengantre. Baris yang jendelanya sudah lewat
	// tidak memperpanjang antrean.
	var last models.Subscription
	start := now
	queued := false
	err := tx.Where("user_id = ? AND status IN ? AND end_date > ?",
		userID, []string{"active", "scheduled"}, now).
		Order("end_date DESC").First(&last).Error
	if err == nil {
		start = last.EndDate
		queued = true
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return time.Time{}, time.Time{}, err
	}
	end := start.AddDate(0, 0, durationDays)

	status := "active"
	if queued {
		status = "scheduled"
	}
	sub := models.Subscription{
		UserID:    userID,
		PlanID:    plan.ID,
		Status:    status,
		StartDate: start,
		EndDate:   end,
		IsTrial:   isTrial,
	}
	if err := tx.Create(&sub).Error; err != nil {
		return time.Time{}, time.Time{}, err
	}
	if !queued {
		planSlug := plan.Slug
		if isTrial {
			planSlug = "trial"
		}
		if err := tx.Model(&models.User{}).Where("id = ?", userID).
			Update("plan", planSlug).Error; err != nil {
			return time.Time{}, time.Time{}, err
		}
	}
	return start, end, nil
}

// GET /api/billing/voucher/redemptions — riwayat penukaran voucher milik
// user, terbaru dulu (maks. 50).
func listVoucherRedemptions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var reds []models.VoucherRedemption
		if err := udb.Where("user_id = ?", userID).Preload("Voucher").
			Order("created_at DESC").Limit(50).Find(&reds).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat riwayat voucher"})
			return
		}
		// Nama paket untuk voucher bertipe plan (sekali jalan, tanpa N+1).
		planIDs := make([]uint, 0, len(reds))
		for _, r := range reds {
			if r.Voucher.PlanID != nil {
				planIDs = append(planIDs, *r.Voucher.PlanID)
			}
		}
		planNames := map[uint]string{}
		if len(planIDs) > 0 {
			var plans []models.Plan
			udb.Where("id IN ?", planIDs).Find(&plans)
			for _, p := range plans {
				planNames[p.ID] = p.Name
			}
		}
		out := make([]gin.H, 0, len(reds))
		for _, r := range reds {
			planName := ""
			if r.Voucher.PlanID != nil {
				planName = planNames[*r.Voucher.PlanID]
			}
			out = append(out, gin.H{
				"id":         r.ID,
				"code":       r.Voucher.Code,
				"type":       r.Voucher.Type,
				"planName":   planName,
				"duration":   r.Voucher.Duration,
				"discount":   r.Voucher.Discount,
				"redeemedAt": r.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, gin.H{"redemptions": out})
	}
}

func java_time_now() time.Time {
	return time.Now()
}
