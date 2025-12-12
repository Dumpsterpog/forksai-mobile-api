const saveTitle = async () => {
  setIsEditingTitle(false);

  try {
    const res = await fetch(`${API_BASE}/updateDeckTitle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deckId,
        title: deckTitle,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      console.log("❌ Failed to save title");
    }

    console.log("✅ Title saved!");
  } catch (err) {
    console.log("SAVE TITLE ERROR:", err);
  }
};
