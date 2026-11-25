export default async function (ctx) {
  await ctx.run("markov", {
    strings: { word: "hello" },
    seed({ client }) {
      const db = client.getDatabase("control-guild");
      db.markovInput("hello world this is a control fixture test sentence");
      db.markovInput("hello friend how is the weather today");
      db.markovInput("hello again from the offline markov fixture");
    },
  });
}
