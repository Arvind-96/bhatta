import multer from "multer";

// Memory storage — files are small (photos/ID documents), and
// person.service.ts writes the buffer to disk itself under DATA_DIR after
// validating which person/kiln it belongs to, rather than letting multer
// write directly to a path derived from unauthenticated request params.
const storage = multer.memoryStorage();

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_TYPES.includes(file.mimetype)) return cb(new Error("Photo must be a JPEG, PNG, or WebP image"));
    cb(null, true);
  },
}).single("photo");

export const uploadIdentityProof = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (![...IMAGE_TYPES, "application/pdf"].includes(file.mimetype)) return cb(new Error("Identity proof must be an image or PDF"));
    cb(null, true);
  },
}).single("document");
