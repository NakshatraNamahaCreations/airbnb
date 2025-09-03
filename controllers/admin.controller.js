import User from '../models/user.model.js';

const getAllUsers = async(req, res) => {
  const users = await User.find().lean();

  res.status(200).json({
    message: 'All User fecthed successfully',
    data: users,
  });
};

const upgradeToHost = async(req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: 'userId nededed' });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { roles: 'host' } },
    { new: true }, // return updated doc
  );

  if (!user) {
    return res.status(404).json({ message: 'user doesnt exist' });
  }

  res.status(200).json({
    message: 'user became host successfully',
    data: user,
  });
};

export { getAllUsers, upgradeToHost };
