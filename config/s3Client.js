import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const publicUrlFor = (key) =>
  `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key)}`;

const presignPut = async({ key, contentType, expiresIn = 60 * 5 }) => {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return { key, putUrl: url, publicUrl: publicUrlFor(key) };
};

export { presignPut, publicUrlFor, REGION, BUCKET, s3 };
