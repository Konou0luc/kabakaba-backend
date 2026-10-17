import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class CloudinaryService {
  private configured = false;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      this.configured = true;
    }
  }

  assertImage(
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Fichier image requis (champ « file »).');
    }
    if (!IMAGE_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Format non supporté (JPEG, PNG, WebP ou GIF).');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image trop volumineuse (5 Mo max).');
    }
  }

  uploadBuffer(buffer: Buffer, folder: string): Promise<string> {
    if (!this.configured) {
      throw new InternalServerErrorException(
        'Stockage image indisponible (CLOUDINARY_* manquant).',
      );
    }
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (err, result) => {
          if (err || !result?.secure_url) {
            reject(err ?? new Error('Upload Cloudinary sans URL'));
            return;
          }
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }
}
