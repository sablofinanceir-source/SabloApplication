const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const Category = require('../models/Category');
const CATEGORIES = require('../constants/categories');
const { toJalali, fromJalali, daysInMonth } = require('./jalali');

const IRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const MONTH_NAMES = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

// همه‌ی مبالغ دیتابیس ریال هستن؛ برای متن اعلان به تومان تبدیل می‌کنیم
const toToman = (rial) => Math.round(rial / 10).toLocaleString('fa-IR');

function jalaliMonthOf(date = new Date()) {
    const d = new Date(date.getTime() + IRAN_OFFSET_MS);
    const { jy, jm } = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return { jy, jm };
}

function jalaliMonthRange(jy, jm) {
    const s = fromJalali(jy, jm, 1);
    const e = fromJalali(jy, jm, daysInMonth(jy, jm));
    return {
        start: new Date(Date.UTC(s.gy, s.gm - 1, s.gd) - IRAN_OFFSET_MS),
        end: new Date(Date.UTC(e.gy, e.gm - 1, e.gd, 23, 59, 59, 999) - IRAN_OFFSET_MS),
    };
}

// مصرف ماه برای همه‌ی دسته‌ها: { categoryId: totalSpent } (ریال)
async function getSpentMap(userId, jy, jm) {
    const { start, end } = jalaliMonthRange(jy, jm);
    const rows = await Transaction.aggregate([
        { $match: { userId, type: 'EXPENSE', date: { $gte: start, $lte: end }, category: { $ne: null } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
    ]);
    return Object.fromEntries(rows.map(r => [r._id, r.total]));
}

async function getCategoryMap(userId) {
    const custom = await Category.find({ userId }).lean();
    const map = new Map(CATEGORIES.map(c => [c.id, { label: c.label, icon: c.icon }]));
    custom.forEach(c => map.set(c.id, { label: c.label, icon: c.icon }));
    return map;
}

const levelFor = (pct) => (pct >= 100 ? 100 : pct >= 80 ? 80 : 0);

// بعد از هر تراکنش هزینه صدا زده می‌شه؛ خودش خطاها رو می‌خوره تا ثبت تراکنش خراب نشه
async function checkBudgetAlert(userId, categoryId, txDate = new Date()) {
    try {
        if (!categoryId) return;
        const { jy, jm } = jalaliMonthOf(new Date(txDate));
        const budget = await Budget.findOne({ userId, categoryId, jy, jm });
        if (!budget) return;

        const spent = (await getSpentMap(userId, jy, jm))[categoryId] || 0;
        const pct = Math.floor((spent / budget.limit) * 100);
        const level = levelFor(pct);

        if (level > budget.lastAlertLevel) {
            // اتمیک: فقط یک درخواست برنده می‌شه و اعلان می‌سازه
            const claimed = await Budget.findOneAndUpdate(
                { _id: budget._id, lastAlertLevel: { $lt: level } },
                { lastAlertLevel: level }
            );
            if (!claimed) return;
            const info = (await getCategoryMap(userId)).get(categoryId);
            const name = info?.label || 'دسته‌بندی';
            const amounts = `${toToman(spent)} از ${toToman(budget.limit)} تومان`;
            await Notification.create({
                userId,
                title: level === 100 ? 'بودجه تموم شد 🚨' : 'نزدیک سقف بودجه‌ای ⚠️',
                message: level === 100
                    ? `بودجه‌ی «${name}» در ${MONTH_NAMES[jm - 1]} تموم شد (${amounts}).`
                    : `۸۰٪ بودجه‌ی «${name}» در ${MONTH_NAMES[jm - 1]} مصرف شده (${amounts}).`,
                relatedBudgetId: budget._id,
                budgetLevel: level,
            });
        } else if (level < budget.lastAlertLevel) {
            // مثلاً تراکنش حذف شد؛ سطح پایین میاد تا دفعه‌ی بعد دوباره هشدار بده
            await Budget.updateOne({ _id: budget._id }, { lastAlertLevel: level });
        }
    } catch (err) {
        console.error('❌ خطا در بررسی بودجه:', err.message);
    }
}

module.exports = { jalaliMonthOf, getSpentMap, getCategoryMap, levelFor, checkBudgetAlert, MONTH_NAMES };
