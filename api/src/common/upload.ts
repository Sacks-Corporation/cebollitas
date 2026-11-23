import { UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { validationError } from './validation/request-validation';

/** Generous cap; the 5 MB business limit is enforced (with its own message) by ImageService. */
const MAX_MULTIPART_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Accepts multipart uploads like FastAPI's `UploadFile` param: extra fields
 * are ignored instead of rejected, and the handler picks the `file` field.
 */
export const AcceptUploads = () =>
  UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_MULTIPART_FILE_BYTES } }));

/** Returns the `file` upload or fails with FastAPI's 422 "Field required". */
export function requireUploadedFile(files: Express.Multer.File[] | undefined, field = 'file'): Express.Multer.File {
  const file = (files ?? []).find((item) => item.fieldname === field);
  if (!file) throw validationError([{ type: 'missing', loc: ['body', field], msg: 'Field required', input: null }]);
  return file;
}
