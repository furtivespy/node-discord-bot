export default async function (ctx) {
  await ctx.run("help", { strings: { command: "wiki" } });
}
