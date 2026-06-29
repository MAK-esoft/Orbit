import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(2, 255)
  fullName: string;

  @IsEnum(Role)
  role: Role;

  // Required when role = RO_USER; ignored for admin roles.
  @IsOptional()
  @IsUUID()
  roId?: string;
}
