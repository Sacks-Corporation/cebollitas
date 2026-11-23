import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { getEnv } from '../config/env';
import { httpError } from '../common/http-errors';

export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const CLOUDINARY_FOLDER = 'cebollitas/monthly-events';
export const TRIPS_FOLDER = 'cebollitas/trips';

export interface UploadedImage {
  originalname?: string;
  buffer: Buffer;
}

/** Port of `services/image_service.py` (Cloudinary uploads). */
@Injectable()
export class ImageService {
  constructor() {
    cloudinary.config({
      cloud_name: getEnv('CLOUDINARY_CLOUD_NAME'),
      api_key: getEnv('CLOUDINARY_API_KEY'),
      api_secret: getEnv('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  async saveUploadedImage(upload: UploadedImage, folder: string = CLOUDINARY_FOLDER): Promise<string> {
    if (!upload.originalname) throw httpError(400, 'Falta el nombre del archivo.');

    let ext = upload.originalname.split('.').pop()!.toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw httpError(400, `Formato no permitido. Usá: ${[...ALLOWED_EXTENSIONS].sort().join(', ')}.`);
    }

    if (upload.buffer.length > MAX_SIZE_BYTES) throw httpError(400, 'La imagen excede el tamaño máximo (5 MB).');

    let result: UploadApiResponse | undefined;
    try {
      result = await this.upload(upload.buffer, folder);
    } catch {
      throw httpError(502, 'No se pudo subir la imagen al almacenamiento remoto.');
    }

    const secureUrl = result?.secure_url;
    if (!secureUrl) throw httpError(502, 'Respuesta inesperada del almacenamiento remoto.');
    return secureUrl;
  }

  private upload(content: Buffer, folder: string): Promise<UploadApiResponse | undefined> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image' }, (error, result) =>
        error ? reject(error) : resolve(result),
      );
      stream.end(content);
    });
  }
}
