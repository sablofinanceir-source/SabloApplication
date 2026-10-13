const Budget = require('../models/Budget');
const Category = require('../models/Category');
const CATEGORIES = require('../constants/categories');
const { jalaliMonthOf, getSpentMap, getCategoryMap, levelFor } = require('../utils/budgetAlerts');
const mongoose = require('mongoose');

const parseMonth = (q) => {
    const cur = jalaliMonthOf();
    const jy = parseInt(q.jy) || cur.jy;
    const jm = parseInt(q.jm) || cur.jm;
    return (jm >= 1 && jm <= 12) ? { jy, jm } : null;
};

exports.getBudgets = async (req, res) => {
    try {
        const month = parseMonth(req.query);
        if (!month) return res.status(400).json({ message: 'ماه نامعتبر است' });
        const userId = new mongoose.Types.ObjectId(req.user.id);

        const [budgets, spentMap, catMap] = await Promise.all([
            Budget.find({ userId, ...month }).lean(),
            getSpentMap(userId, month.jy, month.jm),
            getCategoryMap(userId),
        ]);

        res.status(200).json({
            ...month,
            budgets: budgets.map(b => {
                const spent = spentMap[b.categoryId] || 0;
                const info = catMap.get(b.categoryId) || { label: 'دسته‌بندی حذف‌شده', icon: '❓' };
                return {
                    id: b._id, categoryId: b.categoryId, label: info.label, icon: info.icon,
                    limit: b.limit, spent, remaining: b.limit - spent,
                    percentage: Math.round((spent / b.limit) * 100),
                };
            }),
        });
    } catch (error) {
        res.status(500).json({ message: 'خطای سرور', error: error.message });
    }
};

exports.upsertBudget = async (req, res) => {
    try {
        const { categoryId } = req.body;
        const limit = Number(req.body.limit);
        const month = parseMonth(req.body);
        if (!month) return res.status(400).json({ message: 'ماه نامعتبر است' });
        if (!Number.isFinite(limit) || limit <= 0) return res.status(400).json({ message: 'سقف بودجه باید بیشتر از صفر باشد' });

        const valid = CATEGORIES.some(c => c.id === categoryId)
            || await Category.exists({ id: categoryId, userId: req.user.id });
        if (!valid) return res.status(400).json({ message: 'دسته‌بندی نامعتبر است' });

        // سطح هشدار فعلی بی‌صدا ست می‌شه تا با ویرایش سقف، اعلان ناخواسته نیاد
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const spent = (await getSpentMap(userId, month.jy, month.jm))[categoryId] || 0;
        const level = levelFor(Math.floor((spent / limit) * 100));

        const budget = await Budget.findOneAndUpdate(
            { userId, categoryId, ...month },
            { $set: { limit, lastAlertLevel: level } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(200).json({ message: 'بودجه ذخیره شد', budget });
    } catch (error) {
        res.status(500).json({ message: 'خطای سرور', error: error.message });
    }
};

exports.deleteBudget = async (req, res) => {
    try {
        const deleted = await Budget.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!deleted) return res.status(404).json({ message: 'بودجه یافت نشد' });
        res.status(200).json({ message: 'بودجه حذف شد' });
    } catch (error) {
        res.status(500).json({ message: 'خطای سرور', error: error.message });
    }
};
