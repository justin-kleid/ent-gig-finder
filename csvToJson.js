const csv = require("csvtojson");
const fs = require("fs");

csv()
  .fromFile("gigs.csv")
  .then((jsonArray) => {
    // Transform each CSV row into the desired format:
    const transformed = jsonArray.map((gig) => ({
      venue: gig.Venue,
      capacity: Number(gig.Capacity),
      // Convert the "Genre" string into an array of genres
      genre: gig.Genre.split(",").map((s) => s.trim()),
      address: gig.Address,
      phone: gig.Phone,
      email: gig.Email,
      website: gig.Website,
    }));

    // Write the transformed data to gigs.json
    fs.writeFileSync("gigs.json", JSON.stringify(transformed, null, 2));
    console.log("CSV conversion complete: gigs.json created.");
  })
  .catch((error) => {
    console.error("Error during conversion:", error);
  });
