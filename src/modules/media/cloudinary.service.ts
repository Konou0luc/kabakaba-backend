import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { BadRequestException } from '@nestjs/common';
import {
  detectImageType,
  MAX_IMAGE_BYTES,
  UploadedImageFile,
} from '../../common/utils/image-type';

export type MediaKind = 'logo' | 'banner' | 'dish' | 'school-card';

const TRANSFORM: Record<MediaKind, UploadApiOptions['transformation']> = {
  logo: [{ width: 400, height: 400, crop: 'fill', gravity: 'auto' }],
  banner: [{ width: 1600, height: 640, crop: 'fill', gravity: 'auto' }],
  dish: [{ width: 800, height: 800, crop: 'fill', gravity: 'auto' }],
  'school-card': [{ width: 1200, height: 800, crop: 'limit' }],
};

@Injectable()
export class CloudinaryService {
  private readonly rootFolder: string;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    this.rootFolder = this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'kabakaba';

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  private assertConfigured() {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Cloudinary n’est pas configuré (CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET).',
      );
    }
  }

  assertImage(file?: UploadedImageFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Fichier image manquant');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('L’image ne doit pas dépasser 4 Mo');
    }
    if (!detectImageType(file.buffer)) {
      throw new BadRequestException('Format accepté : JPEG, PNG ou WebP');
    }
  }

  folderFor(kind: MediaKind, entityId: string) {
    if (kind === 'dish') return `${this.rootFolder}/dishes/${entityId}`;
    if (kind === 'school-card') return `${this.rootFolder}/students/${entityId}`;
    return `${this.rootFolder}/canteens/${entityId}`;
  }

  publicIdFor(kind: MediaKind) {
    if (kind === 'dish') return 'photo';
    if (kind === 'school-card') return 'school-card';
    return kind;
  }

  async uploadImage(
    file: UploadedImageFile,
    kind: MediaKind,
    entityId: string,
  ): Promise<{ url: string; publicId: string }> {
    this.assertConfigured();
    this.assertImage(file);

    const folder = this.folderFor(kind, entityId);
    const publicId = this.publicIdFor(kind);

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          overwrite: true,
          invalidate: true,
          resource_type: 'image',
          transformation: TRANSFORM[kind],
        },
        (error, result) => {
          if (error || !result?.secure_url) {
            reject(
              new ServiceUnavailableException(
                'L’envoi de l’image vers Cloudinary a échoué. Réessaie.',
              ),
            );
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(file.buffer);
    });
  }
}
