// ============================================
// Scribble Clone — User Model
// ============================================

import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    email: string;
    username: string;
    passwordHash: string;
    emailVerified: boolean;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    avatar: string | null;
    avatarPublicId: string | null;
    mfaEnabled: boolean;
    mfaSecret: string | null;
    mfaTempSecret: string | null;
    credits: number;
    gamesPlayed: number;
    gamesWon: number;
    totalScore: number;
    location: {
        lat: number;
        lon: number;
        name: string;
    } | null;
    createdAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
            match: /^[a-z0-9_]+$/,
            index: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        firstName: {
            type: String,
            default: null,
            trim: true,
        },
        lastName: {
            type: String,
            default: null,
            trim: true,
        },
        phone: {
            type: String,
            default: null,
            trim: true,
        },
        avatar: {
            type: String,
            default: null,
        },
        avatarPublicId: {
            type: String,
            default: null,
        },
        mfaEnabled: {
            type: Boolean,
            default: false,
        },
        mfaSecret: {
            type: String,
            default: null,
        },
        mfaTempSecret: {
            type: String,
            default: null,
        },
        credits: {
            type: Number,
            default: 0,
        },
        gamesPlayed: {
            type: Number,
            default: 0,
        },
        gamesWon: {
            type: Number,
            default: 0,
        },
        totalScore: {
            type: Number,
            default: 0,
        },
        location: {
            type: {
                lat: { type: Number, required: true },
                lon: { type: Number, required: true },
                name: { type: String, required: true },
            },
            default: null,
            _id: false,
        },
    },
    {
        timestamps: true,
    }
);

// Never return sensitive fields in JSON
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    delete obj.mfaSecret;
    delete obj.mfaTempSecret;
    delete obj.avatarPublicId;
    delete obj.__v;
    return obj;
};

export const User = mongoose.model<IUser>("User", userSchema);
