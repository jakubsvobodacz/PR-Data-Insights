import axios from "axios";
import fs from "fs";

// --- Configuration --- //
const config = {
  owner: "Organization Name",
  repo: "My repo name",
  token: "Your GitHub token",
  baseUrl: "https://api.github.com/graphql",
};

// Validate config
Object.entries(config).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing required configuration: ${key}`);
  }
});

console.log("Configuration:", {
  owner: config.owner,
  repo: config.repo,
  baseUrl: config.baseUrl,
  // Don't log the full token
  token: config.token
    ? `${config.token.substr(0, 4)}...${config.token.substr(-4)}`
    : "missing",
});

const headers = {
  Authorization: `bearer ${config.token}`,
  "Content-Type": "application/json",
};

// api access test
const testQuery = `
  query TestAccess {
    viewer {
      login
      repositories(first: 1) {
        nodes {
          nameWithOwner
        }
      }
    }
    repository(owner: "${config.owner}", name: "${config.repo}") {
      nameWithOwner
    }
  }
`;

// GraphQL query to fetch PRs and their reviews
const getPRsQuery = `
  query GetPullRequests($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      nameWithOwner
      pullRequests(first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          createdAt
          author {
            login
          }
          reviews(first: 100) {
            nodes {
              state
              author {
                login
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchGraphQL(query, variables = {}) {
  try {
    console.log("\nMaking GraphQL request:");
    console.log("Variables:", JSON.stringify(variables, null, 2));
    console.log("Query:", query.trim());

    const response = await axios.post(
      config.baseUrl,
      {
        query,
        variables,
      },
      {
        headers,
        timeout: 10000, // timeout
      }
    );

    if (response.data.errors) {
      console.error(
        "GraphQL Errors:",
        JSON.stringify(response.data.errors, null, 2)
      );
      throw new Error(
        "GraphQL query failed: " + response.data.errors[0].message
      );
    }

    return response.data;
  } catch (error) {
    console.error("Request failed:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}

async function getAllPullRequests() {
  let allPRs = [];
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const response = await fetchGraphQL(getPRsQuery, {
        owner: config.owner,
        repo: config.repo,
        cursor: cursor,
      });

      const prData = response.data.repository.pullRequests;
      allPRs = allPRs.concat(prData.nodes);

      hasNextPage = prData.pageInfo.hasNextPage;
      cursor = prData.pageInfo.endCursor;

      console.log(
        `Fetched ${prData.nodes.length} PRs. Has more pages: ${hasNextPage}`
      );
    }

    return allPRs;
  } catch (error) {
    console.error("Error fetching pull requests:", error.message);
    throw error;
  }
}

// --- Main Script --- //
async function main() {
  try {
    //basic API access test
    console.log("\nTesting API access...");
    const testResponse = await fetchGraphQL(testQuery);
    console.log(
      "API test response:",
      JSON.stringify(testResponse.data, null, 2)
    );

    if (!testResponse.data.viewer) {
      throw new Error("Failed to authenticate with GitHub API");
    }

    console.log(`\nAuthenticated as: ${testResponse.data.viewer.login}`);

    if (!testResponse.data.repository) {
      throw new Error(
        `Cannot access repository: ${config.owner}/${config.repo}`
      );
    }

    // basic access is working
    console.log(
      `\nRepository access confirmed: ${testResponse.data.repository.nameWithOwner}`
    );

    //PR fetching
    console.log("\nFetching pull requests...");
    const userMetrics = {};
    const prs = await getAllPullRequests();
    console.log(`Found ${prs.length} PRs in total.`);

    // Process each PR filtering by creation date (2024) -- here you can change the year
    for (const pr of prs) {
      const createdAt = new Date(pr.createdAt);
      if (createdAt.getFullYear() !== 2024) {
        continue; // Skip PRs not created in 2024
      }

      const prNumber = pr.number;
      const prAuthor = pr.author?.login || "unknown";

      // Initialize metrics for new authors
      if (!userMetrics[prAuthor]) {
        userMetrics[prAuthor] = {
          prsReceivingChanges: 0, // PRs by this author that received change requests
          changesRequested: 0, // Number of times this person requested changes
          totalPRsOpened: 0, // Total PRs opened by this person
        };
      }

      // Increment total PRs opened counter
      userMetrics[prAuthor].totalPRsOpened++;

      // Track change requests received and given
      const changeRequestReviewers = new Set(); // To avoid counting multiple requests from same reviewer

      // Process reviews from GraphQL response
      const reviews = pr.reviews.nodes || [];
      for (const review of reviews) {
        if (review.state === "CHANGES_REQUESTED") {
          const reviewer = review.author?.login;
          if (!reviewer) continue;

          // Initialize metrics for new reviewers
          if (!userMetrics[reviewer]) {
            userMetrics[reviewer] = {
              prsReceivingChanges: 0,
              changesRequested: 0,
              totalPRsOpened: 0,
            };
          }

          // Count unique change requests per PR
          if (!changeRequestReviewers.has(reviewer)) {
            changeRequestReviewers.add(reviewer);
            userMetrics[reviewer].changesRequested++;
          }
        }
      }

      // If PR received any change requests, increment the author's counter
      if (changeRequestReviewers.size > 0) {
        userMetrics[prAuthor].prsReceivingChanges++;
      }

      console.log(`Processed PR #${prNumber} by ${prAuthor}`);
    }

    // Output final JSON object
    // Calculate ratios before outputting
    for (const user in userMetrics) {
      const metrics = userMetrics[user];
      metrics.changeRequestRatio =
        metrics.totalPRsOpened > 0
          ? (
              (metrics.prsReceivingChanges / metrics.totalPRsOpened) *
              100
            ).toFixed(1)
          : 0;
    }

    const outputJson = JSON.stringify(userMetrics, null, 2);
    console.log("Final metrics by user:");
    console.log(outputJson);

    // Save the output to a file
    fs.writeFileSync("pr_metrics_2024.json", outputJson);
    console.log("Results saved to pr_metrics_2024.json");
  } catch (err) {
    console.error("\nFailed to initialize:", err.message);
    throw err;
  }
}

// Execute the script and handle errors
main().catch((err) => {
  console.error("\nAn error occurred:", err);
  process.exit(1);
});
