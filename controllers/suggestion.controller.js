// controllers/suggestions.controller.js
import Suggestion from '../models/suggestion.model.js';

const pick = (obj, keys) =>
  keys.reduce((acc, k) => (obj[k] !== undefined ? (acc[k] = obj[k], acc) : acc), {});

// Map a single incoming payload into a valid Suggestion document
const mapInputToDoc = (input) => {
  const base = pick(input, [
    'place', 'imageUrl', 'location', 'isActive', 'meta',
  ]);

  return base;
};

const createSuggested = async(req, res, next) => {
  try {
    const doc = await Suggestion.create(mapInputToDoc(req.body));

    res.status(201).json({ message: 'Suggestion created successfully', data: doc });
  } catch (err) { next(err); }
};

const createSuggestedBulk = async(req, res, next) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ message: 'Body must be an array of suggestions' });
    }

    const docs = req.body.map(mapInputToDoc);
    const inserted = await Suggestion.insertMany(docs, { ordered: false });

    res.status(201).json({ message: 'Created', count: inserted.length, data: inserted });
  } catch (err) { next(err); }
};

const getSuggested = async(req, res, next) => {
  try {
    const { q, page = 1, limit = 20, isActive } = req.query;

    const filter = {};
    if (q) filter.place = { $regex: q, $options: 'i' };
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Suggestion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Suggestion.countDocuments(filter),
    ]);

    res.status(200).json({
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
      data: items,
    });
  } catch (err) { next(err); }
};

const getSuggestedById = async(req, res, next) => {
  try {
    const doc = await Suggestion.findById(req.params.id);

    if (!doc) return res.status(404).json({ message: 'Not found' });

    res.status(200).json({ data: doc });
  } catch (err) { next(err); }
};

const updateSuggested = async(req, res, next) => {
  try {
    const updates = pick(req.body, [
      'place', 'location', 'imageUrl', 'isActive',  'meta',
    ]);
    console.log('updates: ', updates);

    const doc = await Suggestion.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });

    res.status(200).json({ message: 'Updated', data: doc });
  } catch (err) { next(err); }
};

const deleteSuggested = async(req, res, next) => {
  try {
    const doc = await Suggestion.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });

    res.status(200).json({ message: 'Deleted' });
  } catch (err) { next(err); }
};

export { createSuggested, createSuggestedBulk, getSuggested, getSuggestedById, updateSuggested, deleteSuggested };
