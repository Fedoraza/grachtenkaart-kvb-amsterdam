const SOURCE = "RZ Rondvaartopleidingen · Marifoonkaart Amsterdam · 05-01-2026";

const groups = [
  ["Open Haven / Kromme Waal", 4.90305, 52.37660, [[1,"Open Haven – Kromme Waal"],[2,"Kromme Waal – Open haven"]]],
  ["Kromme Waal / Oude Waal", 4.90244, 52.37622, [[3,"Kromme Waal – Oude Waal"],[4,"Oude Waal – Kromme Waal"]]],
  ["Open Haven / Kolkje", 4.90270, 52.37680, [[5,"Open Haven – Kolkje in"],[6,"Kolkje – Open Haven – stuurboord of bakboord uit"]]],
  ["Kolkje / Oudezijds", 4.900342, 52.375655, [[7,"Kolkje – Oudezijds"],[8,"Oudezijds – Kolkje in"]]],
  ["Gassan / Houtkopersburgwal", 4.903715, 52.369253, [[9,"Gassan – Houtkopersburgwal"],[10,"Houtkopersburgwal naar Gassan"]]],
  ["Houtkopersburgwal / Sint Antonie", 4.901464, 52.369859, [[11,"Houtkopersburgwal – St. Antonie in"]]],
  ["L’Europe / Rokin", 4.893994, 52.367361, [[12,"L’Europe – Rokin"],[17,"Rokin uit"]]],
  ["Muntbrug / Bloemenmarkt", 4.892680, 52.366918, [[13,"L’Europe – Muntbrug naar de bloemenmarkt"],[14,"Bloemenmarkt – Muntbrug – stuurboord of bakboord uit"]]],
  ["Bloemenmarkt / Koningsplein", 4.888904, 52.367852, [[15,"Bloemenmarkt – Koningsplein"],[16,"Koningsplein – Bloemenmarkt"]]],
  ["Haarlemmer / Singel / Brouwer", 4.893972, 52.378777, [[18,"Haarlemmer – Singel of Brouwer"]]],
  ["Fietsenstalling Centraal", 4.89758, 52.37880, [[19,"Fietsenstalling naar buiten"]]],
  ["Prinsengracht / Lauriergracht", 4.882824, 52.371849, [[20,"Prinsen – Laurier"],[21,"Laurier – Prinsen"]]],
  ["American / Lido", 4.880007, 52.363880, [[22,"American – Lido"],[24,"Lido – American"]]],
  ["Lido / Paradiso", 4.884143, 52.362964, [[23,"Lido – Paradiso"],[25,"Paradiso – Lido"]]],
  ["Singelgracht / Boerenwetering", 4.887386, 52.360275, [[26,"Singelgracht – Boerenwetering"],[27,"Boerenwetering – Singelgracht"]]],
  ["Open Haven west / oost", 4.89964, 52.37737, [[28,"West – Oost"],[29,"Oost – West"]]],
  ["Reguliersgracht / Herengracht", 4.895877, 52.364759, [[30,"Thorbecke naar de Bocht of Burgemeester"],[31,"Vanaf de Amstel op de Heren de Regulier in"],[32,"Thorbecke naar de Amstel"],[33,"Vanaf de Bocht op de Heren de Regulier in"],[34,"Regulier – Heren richting Amstel"],[35,"Regulier – Heren richting de Bocht of Burgemeester"]]],
  ["Reguliersgracht / Keizersgracht", 4.895967, 52.363379, [[36,"Regulier kruist de Keizer"],[37,"Keizer kruist de Regulier"],[38,"Keizer de Regulier op richting de Heren"],[39,"Keizer de Regulier op richting de Prinsen"],[40,"Regulier de Keizer op naar de Amstel"],[41,"Regulier de Keizer op naar de Brouwer / Wester"]]],
  ["Reguliersgracht / Prinsengracht", 4.896087, 52.361612, [[42,"Regulier de Prinsen op"],[43,"Regulier kruist de Prinsen"]]],
  ["Leidsegracht / Herengracht", 4.886783, 52.367616, [[44,"Heren – Leidse"],[45,"Leidse – Heren naar de Bocht of Amstel"],[46,"Leidse – Heren naar de Brouwer"]]],
  ["Leidsegracht / Keizersgracht", 4.884851, 52.366899, [[47,"Leidse kruist de Keizer"],[48,"Leidse de Keizer op richting de Brouwer / Wester"],[49,"Leidse de Keizer op richting de Amstel"],[50,"Keizer kruist de Leidse"],[51,"Keizer de Leidse op richting de Heren"],[52,"Keizer de Leidse op richting de Prinsen"]]],
  ["Leidsegracht / Prinsengracht", 4.882789, 52.366175, [[53,"Leidse kruist de Prinsen"],[54,"Leidse de Prinsen op"],[55,"Prinsen kruist de Leidse"],[56,"Prinsen de Leidse op richting de Heren"],[57,"Prinsen de Leidse op richting Singelgracht"]]],
  ["Leliegracht / Herengracht", 4.887902, 52.374726, [[58,"Heren – Lelie"],[59,"Lelie de Heren op richting Amstel"],[60,"Lelie de Heren op richting Brouwer"]]],
  ["Leliegracht / Keizersgracht", 4.885929, 52.375385, [[61,"Lelie kruist de Keizer"],[62,"Lelie de Keizer op richting Brouwer"],[63,"Lelie de Keizer op richting Amstel"],[64,"Keizer kruist de Lelie"],[65,"Keizer de Lelie op richting Heren"],[66,"Keizer de Lelie op richting Prinsen"]]],
  ["Leliegracht / Prinsengracht", 4.884282, 52.375959, [[67,"Lelie de Prinsen op"],[68,"Prinsen de Lelie op"]]],
  ["Brouwersgracht / Korte Prinsengracht", 4.888430, 52.380518, [[69,"Korte Prinsen – Brouwer"],[70,"Brouwer – Prinsen"]]],
  ["Brouwersgracht / Keizersgracht", 4.889935, 52.379698, [[71,"Brouwer voor de Keizer langs"],[72,"Keizer de Brouwer op richting Haarlemmer"],[73,"Keizer de Brouwer op richting Prinsen"],[74,"Brouwer de Keizer op"]]],
  ["Brouwersgracht / Herengracht", 4.892016, 52.379236, [[75,"Brouwer voor de Heren langs"],[76,"Brouwer de Heren op"],[77,"Heren de Brouwer op richting Prinsen"],[78,"Heren de Brouwer op richting Haarlemmer"]]],
  ["Brouwersgracht / Singel", 4.893972, 52.378777, [[79,"Brouwer – Haarlemmer"],[80,"Brouwer het Singel op"],[81,"Singel de Brouwer op"],[82,"Singel – Haarlemmer"]]],
];

const bearings = [
  220,40,230,50,220,40,210,30,250,70,310,330,260,80,270,90,150,180,0,270,90,160,150,340,330,180,0,90,270,
  300,180,90,180,90,300,0,90,0,180,90,270,270,0,270,100,20,90,0,130,0,90,270,90,0,0,90,270,
  270,100,20,90,0,130,0,90,270,270,0,90,180,90,270,270,180,90,180,270,90,90,180,270,0,
];

export function reportingPointsGeoJson() {
  return { type: "FeatureCollection", features: groups.flatMap(([name, longitude, latitude, calls]) => calls.map(([number, call], index) => ({
      type: "Feature",
      id: `rz-reporting-${number}`,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        name,
        locationName: name,
        type: "Aanbevolen marifoonmelding",
        number,
        call,
        routeNames: routeNamesForCall(name, call),
        bearing: bearings[number - 1],
        offsetIndex: index,
        offsetCount: calls.length,
        bidirectional: /kruist|voor de .* langs/i.test(call),
        instruction: "Noem eerst de scheepsnaam en daarna deze vaarrichting. Meld op voldoende afstand om nog te kunnen afstoppen.",
        obligation: "Geen algemene meldplicht; wel uitluister- en communicatieplicht. Melden geeft geen voorrang.",
        source: SOURCE,
      },
    }))) };
}

function routeNamesForCall(locationName, call) {
  const names = new Set();
  for (const source of [locationName, call]) {
    for (const part of String(source || "").split(/\/|–|-|\bnaar\b|\brichting\b|\bkruist\b|\bvoor\b|\blangs\b|\bin\b|\buit\b/iu)) {
      const cleaned = part
        .replace(/\bstuurboord\b|\bbakboord\b|\bde\b|\bhet\b|\bop\b|\bvan(?:af)?\b|\bof\b|\bvoorbij\b/giu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length >= 3) names.add(cleaned);
    }
  }
  return [...names];
}
