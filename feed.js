
fetchAnnouncements()
  .then((items) => renderTicker(document.getElementById("ticker"), items))
  .catch((err) => console.error(err)); 

(async () => {
  const main = document.querySelector("main");
  try {
    const posts = await fetchPublishedPosts();
    const id = new URLSearchParams(location.search).get("id");

    if (main.id === "single") {
      const post = posts.find((p) => p.id === id);
      if (!post) return showMessage(main, "This post doesn't exist (any more).");
      document.title = `${post.title} — the herald`;
      main.replaceChildren(articleElement(post));
      return;
    }

    if (!posts.length) return showMessage(main, "No news yet.");
    main.replaceChildren(...posts.map(articleElement));
  } catch (err) {
    showMessage(main, "Couldn't load the news. Try refreshing.");
    console.error(err);
  }
})();
