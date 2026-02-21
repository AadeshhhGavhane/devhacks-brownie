// ============================================
// Scribble Clone — Transaction Model
// Tracks PhonePe payment lifecycle for credit purchases
// ============================================

import mongoose, { Schema, type Document } from "mongoose";

export type TransactionState = "INITIATED" | "COMPLETED" | "FAILED";

export interface ITransaction extends Document {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    merchantOrderId: string;
    credits: number;
    amountPaise: number;
    state: TransactionState;
    phonepeOrderId: string | null;
    transactionId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        merchantOrderId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        credits: {
            type: Number,
            required: true,
        },
        amountPaise: {
            type: Number,
            required: true,
        },
        state: {
            type: String,
            enum: ["INITIATED", "COMPLETED", "FAILED"],
            default: "INITIATED",
        },
        phonepeOrderId: {
            type: String,
            default: null,
        },
        transactionId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export const Transaction = mongoose.model<ITransaction>("Transaction", transactionSchema);
