// Function to load JSON data from a file
async function loadJSON(file) {
  console.log(`Attempting to load JSON from: ${file}`);
  try {
    const response = await fetch(file);
    console.log("Fetch response:", {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      throw new Error(
        `Could not load ${file}: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log("Successfully loaded JSON data:", data);
    return data;
  } catch (error) {
    console.error("Error in loadJSON:", error);
    throw error;
  }
}

// Function to render a bar chart using Chart.js
function renderBarChart(ctx, data, title, yAxisLabel, color) {
  // Sort data in descending order
  const sortedData = Object.entries(data).sort(([, a], [, b]) => b - a);

  const labels = sortedData.map(([label]) => label);
  const values = sortedData.map(([, value]) => value);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: color.background,
          borderColor: color.border,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: title,
          font: {
            size: 16,
          },
        },
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = context.parsed.y;
              return title.includes("%") ? `${value}%` : value.toString();
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "GitHub Username",
            font: {
              size: 14,
            },
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yAxisLabel,
            font: {
              size: 14,
            },
          },
        },
      },
    },
  });
}

// Render charts once the DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("DOM loaded, checking canvas elements...");

    // Check if canvas elements exist
    const canvas1 = document.getElementById("prChart1");
    const canvas2 = document.getElementById("prChart2");
    const canvas3 = document.getElementById("prChart3");

    if (!canvas1 || !canvas2 || !canvas3) {
      throw new Error(
        `Missing canvas elements: ${!canvas1 ? "prChart1 " : ""}${
          !canvas2 ? "prChart2 " : ""
        }${!canvas3 ? "prChart3" : ""}`
      );
    }

    console.log("All canvas elements found");

    // Load PR metrics data
    let prMetrics;
    try {
      prMetrics = await loadJSON("pr_metrics_2024.json");
      console.log("Loaded PR metrics data:", prMetrics);
    } catch (error) {
      console.error("Failed to load JSON:", error);
      throw new Error(`Failed to load data: ${error.message}`);
    }

    if (!prMetrics || typeof prMetrics !== "object") {
      throw new Error("Invalid data format in pr_metrics_2024.json");
    }

    // Prepare data for each chart
    const prsReceivingChanges = {};
    const changesRequested = {};
    const changeRequestRatios = {};

    Object.entries(prMetrics).forEach(([user, data]) => {
      prsReceivingChanges[user] = data.prsReceivingChanges;
      changesRequested[user] = data.changesRequested;
      changeRequestRatios[user] = parseFloat(data.changeRequestRatio);
    });

    // Colors for each chart
    const colors = {
      receiving: {
        background: "rgba(255, 99, 132, 0.6)",
        border: "rgba(255, 99, 132, 1)",
      },
      requesting: {
        background: "rgba(54, 162, 235, 0.6)",
        border: "rgba(54, 162, 235, 1)",
      },
      ratio: {
        background: "rgba(75, 192, 192, 0.6)",
        border: "rgba(75, 192, 192, 1)",
      },
    };

    console.log("Rendering charts...");

    // Render each chart
    renderBarChart(
      canvas1.getContext("2d"),
      prsReceivingChanges,
      "PRs Receiving Changes",
      "Number of PRs",
      colors.receiving
    );
    console.log("Chart 1 rendered");

    renderBarChart(
      canvas2.getContext("2d"),
      changesRequested,
      "Changes Requested to Others",
      "Number of Reviews",
      colors.requesting
    );
    console.log("Chart 2 rendered");

    renderBarChart(
      canvas3.getContext("2d"),
      changeRequestRatios,
      "% PRs Needing Changes",
      "Percentage",
      colors.ratio
    );
    console.log("Chart 3 rendered");
  } catch (error) {
    console.error("Error loading data or rendering charts:", error);
    // Add error message to the page
    const container = document.querySelector(".charts-container");
    if (container) {
      container.innerHTML += `<div style="color: red; padding: 20px;">Error: ${error.message}</div>`;
    }
  }
});
