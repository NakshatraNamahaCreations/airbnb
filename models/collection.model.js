import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

collectionSchema.index({ user: 1, name: 1 }, { unique: true });


const Collection = mongoose.model('Collection', collectionSchema);

export default Collection;
