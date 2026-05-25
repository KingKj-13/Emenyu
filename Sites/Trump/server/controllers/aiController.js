function createAiController({ aiService }) {
  return {
    async chat(req, res) {
      const data = await aiService.chat(req.body);
      res.json(data);
    },

    async aiPairing(req, res) {
      const data = await aiService.aiPairing(req.body);
      res.json(data);
    },

    async recommend(req, res) {
      const data = await aiService.recommend(req.body);
      res.json(data);
    },

    async getChatHistory(req, res) {
      const history = await aiService.getChatHistory();
      res.json(history);
    }
  };
}

module.exports = {
  createAiController
};
