import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../public/uploads"),
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    const allowed = [
      "image/jpeg", "image/jpg", "image/png", 
      "image/gif", "image/webp", "image/x-icon", 
      "image/vnd.microsoft.icon", "image/svg+xml"
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file gambar (JPEG, PNG, GIF, WebP, ICO, SVG) yang diperbolehkan"));
    }
  },
});

const router = Router();

router.post("/upload/image", upload.single("image"), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ message: "Tidak ada file yang diupload" });
    return;
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

export default router;
