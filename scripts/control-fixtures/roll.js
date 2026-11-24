export default async function (ctx) {
  await ctx.run("roll", { strings: { dice: "2d6" } });
}
