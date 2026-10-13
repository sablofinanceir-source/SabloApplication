const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: String, required: true },   // id پیش‌فرض یا شخصی
    jy: { type: Number, required: true },
    jm: { type: Number, required: true, min: 1, max: 12 },
    limit: { type: Number, required: true, min: 1 },
    lastAlertLevel: { type: Number, enum: [0, 80, 100], default: 0 }, // برای جلوگیری از اعلان تکراری
}, { timestamps: true });

budgetSchema.index({ userId: 1, categoryId: 1, jy: 1, jm: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
