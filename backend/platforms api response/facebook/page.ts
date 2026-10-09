type pages = {
  pages: page[];
};

type page = {
  id: string;
  name: string;
  access_token: string;
  picture: {
    data: {
      height: number;
      is_silhouette: boolean;
      url: string;
      width: number;
    };
  };
};
