import { presignPut } from '../config/s3Client.js';
import asyncHandler from '../middlewares/asyncHandler.js';

const slug = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');

const presignListingImages = asyncHandler(async(req, res) => {
  const ownerId = req.adminId || req.userId;
  const ownerKind = req.adminId ? 'admin' : 'user';
  const { filesMeta = [] } = req.body || {};

  if (!Array.isArray(filesMeta) || filesMeta.length === 0) {
    return res.status(400).json({ ok: false, message: 'filesMeta required' });
  }

  const now = Date.now();
  const results = await Promise.all(
    filesMeta.map((f, i) =>
      presignPut({
        key: `listings/${ownerKind}/${ownerId}/${now}_${i}_${slug(f.fileName)}`,
        contentType: f.contentType || 'application/octet-stream',
      }),
    ),
  );

  return res.status(200).json({ ok: true, uploads: results });
});

export { presignListingImages };
