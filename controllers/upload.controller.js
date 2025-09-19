import { presignPut } from '../config/s3Client.js';
import asyncHandler from '../middlewares/asynchandler.js';



// const filesMeta = [
//   {
//     'fileName': 'image1.jpg',
//     'contentType': 'image/jpeg',
//   },
//   // {
//   //   'fileName': 'image2.png',
//   //   'contentType': 'image/png',
//   // },
// ];

const presignListingImages = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { filesMeta = [] } = req.body || {};

  if (!Array.isArray(filesMeta) || filesMeta.length === 0) {
    return res.status(400).json({ ok: false, message: 'filesMeta required' });
  }

  // const user = await User.findById(userId).lean();
  // if (!user) return res.status(401).json({ ok: false, message: 'User not found' });

  const now = Date.now();
  const results = await Promise.all(
    filesMeta.map((f, i) =>
      presignPut({
        key: `listings/${userId}/${now}_${i}_${slug(f.fileName)}`,
        contentType: f.contentType || 'application/octet-stream',
      }),
    ),
  );

  return res.status(200).json({ ok: true, uploads: results });
});

const slug = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');

export { presignListingImages };
